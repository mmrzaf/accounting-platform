import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, invalidState, missing, invalid } from './errors.ts'
import { dateOnly, hash, key, positiveAmount, text, uuid } from './validation.ts'
import type { TradeContext } from './context.ts'
import type { CompanyAction, ReverseDocumentInput } from './types.ts'
import type { Actor } from '../identity/types.ts'
interface Invoice { id: string; kind: 'sale' | 'purchase'; status: string; issued_on: string; control_account_id: string; total_minor: string; currency: string }
interface Line { id: string; account_id: string; line_total_minor: string }
interface Credit { id: string; invoice_id: string; invoice_line_id: string; account_id: string; credited_on: string; amount_minor: string;
  reason: string; status: 'draft' | 'posted' | 'reversed' | 'voided'; request_key: string; fingerprint: string; journal_id: string | null; reversal_journal_id: string | null }
const query = `SELECT id,invoice_id,invoice_line_id,account_id,credited_on,CAST(amount_minor AS TEXT) AS amount_minor,
 reason,status,request_key,fingerprint,journal_id,reversal_journal_id FROM trade_credit_notes`
/** Partial credit notes against one line of an unpaid source invoice; no inventory/tax/refund side effects. */
export function createCreditService(ctx: TradeContext) {
  const { db, authorize, transaction, accounting, audit, book } = ctx
  const invoice = (actor: Actor, companyId: string, id: string) => {
    if (actor.companyId !== companyId) return missing()
    return rowAs<Invoice>(db.prepare(`SELECT id,kind,status,issued_on,control_account_id,
    CAST(total_minor AS TEXT) AS total_minor,currency FROM trade_invoices WHERE company_id=? AND id=?`)
      .get(actor.companyId, uuid(id, 'invoiceId'))) ?? missing()
  }
  function line(invoiceId: string, lineId: string) {
    return rowAs<Line>(db.prepare(`SELECT id,account_id,CAST(line_total_minor AS TEXT) AS line_total_minor FROM trade_invoice_lines
      WHERE invoice_id=? AND id=?`).get(invoiceId, uuid(lineId, 'invoiceLineId'))) ?? missing()
  }
  const permission = (kind: Invoice['kind'], action: 'read' | 'manage') => kind === 'sale' ? `sales.${action}` as const : `purchasing.${action}` as const
  function load(actor: Actor, companyId: string, id: string) {
    if (actor.companyId !== companyId) return missing()
    return rowAs<Credit>(db.prepare(`${query} WHERE company_id=? AND id=?`).get(actor.companyId, uuid(id, 'creditNoteId'))) ?? missing()
  }
  const present = (r: Credit) => ({ id: r.id, invoiceId: r.invoice_id, invoiceLineId: r.invoice_line_id,
    creditedOn: r.credited_on, amountMinor: r.amount_minor, reason: r.reason, status: r.status, journalId: r.journal_id, reversalJournalId: r.reversal_journal_id })
  function used(query: string, id: string) {
    return BigInt(rowAs<{ total: string }>(db.prepare(query).get(id))?.total ?? '0')
  }
  const creditedInvoice = (id: string) => used(`SELECT bigint_total(amount_minor) AS total FROM trade_credit_notes WHERE invoice_id=? AND status='posted'`, id)
  const creditedLine = (id: string) => used(`SELECT bigint_total(amount_minor) AS total FROM trade_credit_notes WHERE invoice_line_id=? AND status='posted'`, id)
  const allocated = (id: string) => used(`SELECT bigint_total(a.amount_minor) AS total FROM payment_allocations a
    WHERE a.invoice_id=? AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)`, id)
  function create(input: CompanyAction & { invoiceId: string; invoiceLineId: string; creditedOn: string; amountMinor: string; reason: string; requestKey: string }) {
    const invoiceId = uuid(input.invoiceId, 'invoiceId'), lineId = uuid(input.invoiceLineId, 'invoiceLineId')
    const creditedOn = dateOnly(input.creditedOn), amount = positiveAmount(input.amountMinor, 'Credit amount')
    const reason = text(input.reason, 'Credit reason', 500), requestKey = key(input.requestKey, 'requestKey')
    const fingerprint = hash({ invoiceId, lineId, creditedOn, amount: amount.toString(), reason })
    return transaction(db, () => {
      const actor = authorize(input, 'company.read')
      const source = invoice(actor, input.companyId, invoiceId)
      authorize(input, permission(source.kind, 'manage'))
      const existing = rowAs<Credit>(db.prepare(`${query} WHERE company_id=? AND request_key=?`).get(actor.companyId, requestKey))
      if (existing) {
        if (existing.fingerprint !== fingerprint) return conflict('Credit request key reused with different contents')
        return { ...present(existing), replayed: true }
      }
      if (source.status !== 'posted' || creditedOn < source.issued_on) return invalidState('Credit requires a posted invoice and a credit date on or after issuance')
      const invoiceLine = line(source.id, lineId)
      if (amount > BigInt(invoiceLine.line_total_minor)) return invalid('Credit exceeds source line amount')
      const id = randomUUID()
      db.prepare(`INSERT INTO trade_credit_notes(id,company_id,invoice_id,invoice_line_id,account_id,credited_on,amount_minor,reason,request_key,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, input.companyId, invoiceId, lineId, invoiceLine.account_id, creditedOn, amount, reason, requestKey, fingerprint)
      audit(actor, input.companyId, 'trade.credit.create', 'trade_credit_note', id)
      return { ...present(load(actor, input.companyId, id)), replayed: false }
    })
  }
  function post(input: CompanyAction & { creditNoteId: string }) {
    return transaction(db, () => {
      const actor = authorize(input, 'company.read'), credit = load(actor, input.companyId, input.creditNoteId)
      const source = invoice(actor, input.companyId, credit.invoice_id)
      authorize(input, permission(source.kind, 'manage'))
      authorize(input, 'accounting.post')
      if (credit.status === 'posted') return { ...present(credit), replayed: true }
      if (credit.status !== 'draft' || source.status !== 'posted') return invalidState('Only a draft credit on a posted invoice can be posted')
      if (book(actor, input.companyId).base_currency !== source.currency) return invalid('Base-currency credit notes only')
      if (creditedLine(credit.invoice_line_id) + BigInt(credit.amount_minor) > BigInt(line(source.id, credit.invoice_line_id).line_total_minor))
        return conflict('Credited amount exceeds original invoice line')
      if (creditedInvoice(source.id) + allocated(source.id) + BigInt(credit.amount_minor) > BigInt(source.total_minor))
        return conflict('Credit exceeds remaining unpaid invoice balance')
      const sale = source.kind === 'sale'
      const journal = accounting.postWithinTransaction({ ...input, date: credit.credited_on, sourceType: 'trade.credit_note', sourceId: credit.id,
        sourceEvent: 'post', idempotencyKey: `trade.credit.${credit.id}`, description: credit.reason,
        lines: sale ? [{ accountId: credit.account_id, debitMinor: credit.amount_minor, creditMinor: '0' },
          { accountId: source.control_account_id, debitMinor: '0', creditMinor: credit.amount_minor }]
          : [{ accountId: source.control_account_id, debitMinor: credit.amount_minor, creditMinor: '0' },
            { accountId: credit.account_id, debitMinor: '0', creditMinor: credit.amount_minor }] }, { allowDocumentSource: true })
      db.prepare(`UPDATE trade_credit_notes SET journal_id=?,status='posted' WHERE id=? AND status='draft'`).run(journal.id, credit.id)
      audit(actor, input.companyId, 'trade.credit.post', 'trade_credit_note', credit.id)
      return { ...present(load(actor, input.companyId, credit.id)), replayed: false }
    })
  }
  function reverse(input: ReverseDocumentInput) {
    const reversedOn = dateOnly(input.reversedOn), reason = text(input.reason, 'Reversal reason', 500), requestKey = key(input.requestKey, 'requestKey')
    return transaction(db, () => {
      const actor = authorize(input, 'company.read'), credit = load(actor, input.companyId, input.id)
      const source = invoice(actor, input.companyId, credit.invoice_id)
      authorize(input, permission(source.kind, 'manage'))
      authorize(input, 'accounting.reverse')
      if ((credit.status !== 'posted' && credit.status !== 'reversed') || !credit.journal_id) return invalidState('Only posted credit can be reversed')
      const reversal = accounting.reverseWithinTransaction({ ...input, journalId: credit.journal_id, date: reversedOn,
        reason, idempotencyKey: requestKey }, { allowDocumentSource: true })
      if (credit.status === 'reversed') return { ...present(credit), replayed: true }
      db.prepare(`UPDATE trade_credit_notes SET reversal_journal_id=?,status='reversed' WHERE id=? AND status='posted'`).run(reversal.id, credit.id)
      audit(actor, input.companyId, 'trade.credit.reverse', 'trade_credit_note', credit.id)
      return { ...present(load(actor, input.companyId, credit.id)), replayed: false }
    })
  }
  function voidCreditNote(input: CompanyAction & { creditNoteId: string }) {
    return transaction(db, () => {
      const actor = authorize(input, 'company.read'), note = load(actor, input.companyId, input.creditNoteId)
      const source = invoice(actor, input.companyId, note.invoice_id)
      authorize(input, permission(source.kind, 'manage'))
      if (note.status !== 'draft') return invalidState('Only draft credit notes may be voided')
      db.prepare("UPDATE trade_credit_notes SET status='voided' WHERE id=? AND status='draft'").run(note.id)
      audit(actor, input.companyId, 'trade.credit.void', 'trade_credit_note', note.id)
      return present(load(actor, input.companyId, note.id))
    })
  }
  function get(input: CompanyAction & { creditNoteId: string }) {
    const actor = authorize(input, 'company.read'), row = load(actor, input.companyId, input.creditNoteId)
    const source = invoice(actor, input.companyId, row.invoice_id)
    authorize(input, permission(source.kind, 'read'))
    return present(row)
  }
  function list(input: CompanyAction & { invoiceId: string }) {
    const actor = authorize(input, 'company.read'), source = invoice(actor, input.companyId, input.invoiceId)
    authorize(input, permission(source.kind, 'read'))
    return rowsAs<Credit>(db.prepare(`${query} WHERE company_id=? AND invoice_id=? ORDER BY id LIMIT 1000`)
      .all(actor.companyId, source.id)).map(present)
  }
  return Object.freeze({ createCreditNote: create, postCreditNote: post, reverseCreditNote: reverse, voidCreditNote, getCreditNote: get, listCreditNotes: list })
}
