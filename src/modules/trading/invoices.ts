import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, invalid, invalidState, missing } from './errors.ts'
import { nextDocumentNumber } from './numbering.ts'
import { dateOnly, hash, key, kind, linesOf, text, uuid } from './validation.ts'
import type { ValidLine } from './validation.ts'
import type { TradeContext } from './context.ts'
import type { Actor } from '../identity/types.ts'
import type { CompanyAction, CreateInvoiceInput, FinancialMutation, InvoiceKind, ReviseInvoiceInput, ReverseDocumentInput } from './types.ts'
interface InvoiceRow {
  id: string; kind: InvoiceKind; party_id: string; issued_on: string; control_account_id: string
  currency: string; total_minor: string; number: string | null; status: 'draft' | 'posted' | 'reversed' | 'voided'
  request_key: string; fingerprint: string; revision: number
  journal_id: string | null; reversal_journal_id: string | null; description: string
}
interface InvoiceLineRow {
  line_no: number; id: string; item_kind: string; description: string
  quantity_milli: string; unit_price_minor: string; line_total_minor: string; account_id: string
}
const invoiceSelect = `SELECT id,kind,party_id,issued_on,control_account_id,currency,CAST(total_minor AS TEXT) AS total_minor,number,
 status,request_key,fingerprint,revision,journal_id,reversal_journal_id,description FROM trade_invoices`
const lineSelect = `SELECT id,line_no,item_kind,description,CAST(quantity_milli AS TEXT) AS quantity_milli,
 CAST(unit_price_minor AS TEXT) AS unit_price_minor,CAST(line_total_minor AS TEXT) AS line_total_minor,account_id
 FROM trade_invoice_lines`
function permission(kind: InvoiceKind, action: 'read' | 'manage'): 'sales.read' | 'sales.manage' | 'purchasing.read' | 'purchasing.manage' {
  return kind === 'sale' ? `sales.${action}` : `purchasing.${action}`
}
function serialLine(row: InvoiceLineRow) {
  return { id: row.id, lineNo: row.line_no, itemKind: row.item_kind, description: row.description,
    quantityMilli: row.quantity_milli, unitPriceMinor: row.unit_price_minor, lineTotalMinor: row.line_total_minor, accountId: row.account_id }
}
export function createInvoiceService(ctx: TradeContext) {
  const { db, authorize, book, account, party, audit, accounting, transaction } = ctx
  function load(actor: Actor, companyId: string, id: string): InvoiceRow {
    return rowAs<InvoiceRow>(db.prepare(`${invoiceSelect} WHERE organization_id=? AND company_id=? AND id=?`).get(actor.organizationId, companyId, uuid(id, 'invoiceId'))) ?? missing()
  }
  function lines(invoiceId: string): InvoiceLineRow[] {
    return rowsAs<InvoiceLineRow>(db.prepare(`${lineSelect} WHERE invoice_id=? ORDER BY line_no`).all(invoiceId))
  }
  function applied(invoiceId: string): bigint {
    const value = rowAs<{ total: string }>(db.prepare(`SELECT bigint_total(a.amount_minor) AS total FROM payment_allocations a
      WHERE a.invoice_id=? AND NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)`).get(invoiceId))
    return BigInt(value?.total ?? '0')
  }
  function view(row: InvoiceRow) {
    const appliedAmount = applied(row.id)
    return { id: row.id, kind: row.kind, partyId: row.party_id, issuedOn: row.issued_on, controlAccountId: row.control_account_id,
      currency: row.currency, totalMinor: row.total_minor, number: row.number, appliedMinor: appliedAmount.toString(),
      outstandingMinor: (row.status === 'posted' ? BigInt(row.total_minor) - appliedAmount : 0n).toString(), status: row.status,
      revision: row.revision, description: row.description, journalId: row.journal_id, reversalJournalId: row.reversal_journal_id,
      lines: lines(row.id).map(serialLine) }
  }
  function validateAccounts(actor: Actor, input: Pick<CreateInvoiceInput, 'kind'|'companyId'|'partyId'|'controlAccountId'>, validated: ValidLine[]) {
    party(actor, input.partyId)
    account(actor, input.companyId, input.controlAccountId, input.kind === 'sale' ? 'asset' : 'liability')
    for (const line of validated)
      account(actor, input.companyId, line.accountId, input.kind === 'sale' ? 'revenue' : 'expense')
  }
  function insertLines(actor: Actor, companyId: string, id: string, validated: ValidLine[]) {
    const insert = db.prepare(`INSERT INTO trade_invoice_lines(id,invoice_id,organization_id,company_id,line_no,item_kind,description,
      quantity_milli,unit_price_minor,line_total_minor,account_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    validated.forEach((line, index) => insert.run(randomUUID(), id, actor.organizationId, companyId, index + 1,
      line.itemKind, line.description, line.quantityMilli, line.unitPriceMinor, line.lineTotalMinor, line.accountId))
  }
  function normalized(input: CreateInvoiceInput) {
    const invoiceKind = kind(input.kind, ['sale', 'purchase'] as const, 'invoice kind')
    const issuedOn = dateOnly(input.issuedOn, 'issuedOn')
    const partyId = uuid(input.partyId, 'partyId')
    const control = uuid(input.controlAccountId, 'controlAccountId')
    const description = text(input.description, 'Invoice description', 500)
    const prepared = linesOf(input.lines)
    const requestKey = key(input.requestKey, 'requestKey')
    const fingerprint = hash({ invoiceKind, issuedOn, partyId, control, description,
      lines: prepared.lines.map(line => ({ ...line, quantityMilli: line.quantityMilli.toString(),
        unitPriceMinor: line.unitPriceMinor.toString(), lineTotalMinor: line.lineTotalMinor.toString() })) })
    return { invoiceKind, issuedOn, partyId, control, description, prepared, requestKey, fingerprint }
  }
  function createInvoice(input: CreateInvoiceInput) {
    const value = normalized(input)
    return transaction(db, () => {
      const actor = authorize(input, permission(value.invoiceKind, 'manage'))
      const existing = rowAs<InvoiceRow>(db.prepare(`${invoiceSelect} WHERE organization_id=? AND company_id=? AND request_key=?`).get(actor.organizationId, input.companyId, value.requestKey))
      if (existing) {
        if (existing.fingerprint !== value.fingerprint) return conflict('Invoice request key reused with different contents')
        return { ...view(existing), replayed: true }
      }
      const currency = book(actor, input.companyId).base_currency
      validateAccounts(actor, { ...input, kind: value.invoiceKind, partyId: value.partyId, controlAccountId: value.control }, value.prepared.lines)
      const id = randomUUID()
      db.prepare(`INSERT INTO trade_invoices(id,organization_id,company_id,kind,party_id,issued_on,control_account_id,currency,
        total_minor,request_key,fingerprint,description) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, actor.organizationId, input.companyId, value.invoiceKind, value.partyId, value.issuedOn, value.control,
          currency, value.prepared.total, value.requestKey, value.fingerprint, value.description)
      insertLines(actor, input.companyId, id, value.prepared.lines)
      audit(actor, input.companyId, 'trade.invoice.create', 'trade_invoice', id, { kind: value.invoiceKind })
      return { ...view(load(actor, input.companyId, id)), replayed: false }
    })
  }
  function reviseInvoice(input: ReviseInvoiceInput) {
    const value = normalized({ ...input, requestKey: 'revision' })
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) return invalid('Invalid expectedRevision')
    return transaction(db, () => {
      const actor = authorize(input, permission(value.invoiceKind, 'manage'))
      const original = load(actor, input.companyId, input.invoiceId)
      if (original.kind !== value.invoiceKind) return missing()
      if (original.status !== 'draft') return invalidState('Only draft invoices can be revised')
      if (original.revision !== input.expectedRevision) return conflict('Draft was modified by another operation')
      validateAccounts(actor, { ...input, kind: value.invoiceKind, partyId: value.partyId, controlAccountId: value.control }, value.prepared.lines)
      db.prepare('DELETE FROM trade_invoice_lines WHERE invoice_id=?').run(original.id)
      db.prepare(`UPDATE trade_invoices SET party_id=?,issued_on=?,control_account_id=?,total_minor=?,description=?,revision=revision+1
        WHERE organization_id=? AND company_id=? AND id=? AND status='draft' AND revision=?`)
        .run(value.partyId, value.issuedOn, value.control, value.prepared.total, value.description,
          actor.organizationId, input.companyId, original.id, input.expectedRevision)
      insertLines(actor, input.companyId, original.id, value.prepared.lines)
      audit(actor, input.companyId, 'trade.invoice.revise', 'trade_invoice', original.id, { revision: input.expectedRevision + 1 })
      return view(load(actor, input.companyId, original.id))
    })
  }
  function getInvoice(input: CompanyAction & { invoiceId: string }) {
    const actor = authorize(input, 'company.read')
    const row = load(actor, input.companyId, input.invoiceId)
    authorize(input, permission(row.kind, 'read'))
    return view(row)
  }
  function listInvoices(input: CompanyAction & { kind: InvoiceKind; limit?: number }) {
    const invoiceKind = kind(input.kind, ['sale', 'purchase'] as const, 'invoice kind')
    const actor = authorize(input, permission(invoiceKind, 'read'))
    const limit = input.limit ?? 100
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid('Invalid list limit')
    return rowsAs<InvoiceRow>(db.prepare(`${invoiceSelect} WHERE organization_id=? AND company_id=? AND kind=? ORDER BY issued_on DESC,id DESC LIMIT ?`)
      .all(actor.organizationId, input.companyId, invoiceKind, limit)).map(view)
  }
  function postInvoice(input: FinancialMutation) {
    return transaction(db, () => {
      const actor = authorize(input, 'company.read')
      const row = load(actor, input.companyId, input.id)
      authorize(input, permission(row.kind, 'manage'))
      authorize(input, 'accounting.post')
      if (row.status === 'posted') return { ...view(row), replayed: true }
      if (row.status !== 'draft') return invalidState('Only a draft invoice can be posted')
      const preparedLines = lines(row.id)
      if (preparedLines.length === 0) return invalid('Invoice has no lines')
      if (book(actor, input.companyId).base_currency !== row.currency) return invalid('Invoice currency must match accounting base currency')
      validateAccounts(actor, { kind: row.kind, companyId: input.companyId, partyId: row.party_id, controlAccountId: row.control_account_id },
        preparedLines.map(line => ({ accountId: line.account_id }) as ValidLine))
      const invoiceTotal = preparedLines.reduce((sum, line) => sum + BigInt(line.line_total_minor), 0n)
      if (invoiceTotal !== BigInt(row.total_minor)) throw new Error('Source invoice lines do not reconcile')
      const journalLines = row.kind === 'sale'
        ? [ { accountId: row.control_account_id, debitMinor: row.total_minor, creditMinor: '0' },
            ...preparedLines.map(line => ({ accountId: line.account_id, debitMinor: '0', creditMinor: line.line_total_minor })) ]
        : [ ...preparedLines.map(line => ({ accountId: line.account_id, debitMinor: line.line_total_minor, creditMinor: '0' })),
            { accountId: row.control_account_id, debitMinor: '0', creditMinor: row.total_minor } ]
      const journal = accounting.postWithinTransaction({ ...input, date: row.issued_on,
        sourceType: 'trade.invoice', sourceId: row.id, sourceEvent: 'post', idempotencyKey: `trade.invoice.${row.id}`,
        description: row.description, lines: journalLines }, { allowDocumentSource: true })
      const number = nextDocumentNumber(db, actor, input.companyId, row.kind)
      db.prepare(`UPDATE trade_invoices SET journal_id=?,number=?,status='posted'
        WHERE organization_id=? AND company_id=? AND id=? AND status='draft'`).run(journal.id, number, actor.organizationId, input.companyId, row.id)
      audit(actor, input.companyId, 'trade.invoice.post', 'trade_invoice', row.id, { kind: row.kind })
      return { ...view(load(actor, input.companyId, row.id)), replayed: false }
    })
  }
  function voidInvoice(input: FinancialMutation) {
    return transaction(db, () => {
      const actor = authorize(input, 'company.read')
      const row = load(actor, input.companyId, input.id)
      authorize(input, permission(row.kind, 'manage'))
      if (row.status !== 'draft') return invalidState('Only drafts may be voided')
      db.prepare(`UPDATE trade_invoices SET status='voided' WHERE id=? AND organization_id=? AND company_id=?`).run(row.id, actor.organizationId, input.companyId)
      audit(actor, input.companyId, 'trade.invoice.void', 'trade_invoice', row.id)
      return view(load(actor, input.companyId, row.id))
    })
  }
  function reverseInvoice(input: ReverseDocumentInput) {
    const date = dateOnly(input.reversedOn, 'reversedOn'), reason = text(input.reason, 'Reason', 500), requestKey = key(input.requestKey, 'requestKey')
    return transaction(db, () => {
      const actor = authorize(input, 'company.read')
      const row = load(actor, input.companyId, input.id)
      authorize(input, permission(row.kind, 'manage'))
      authorize(input, 'accounting.reverse')
      if ((row.status !== 'posted' && row.status !== 'reversed') || !row.journal_id) return invalidState('Only a posted invoice can be reversed')
      if (applied(row.id) !== 0n) return conflict('Reverse allocations before reversing the invoice')
      const reversed = accounting.reverseWithinTransaction({ ...input, journalId: row.journal_id, date,
        idempotencyKey: requestKey, reason }, { allowDocumentSource: true })
      if (row.status === 'reversed') return { ...view(row), replayed: true }
      db.prepare(`UPDATE trade_invoices SET reversal_journal_id=?,status='reversed'
        WHERE id=? AND organization_id=? AND company_id=?`).run(reversed.id, row.id, actor.organizationId, input.companyId)
      audit(actor, input.companyId, 'trade.invoice.reverse', 'trade_invoice', row.id, { reason })
      return { ...view(load(actor, input.companyId, row.id)), replayed: false }
    })
  }
  return Object.freeze({ createInvoice, reviseInvoice, getInvoice, listInvoices, postInvoice, voidInvoice, reverseInvoice })
}
