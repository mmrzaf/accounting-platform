import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, invalid, invalidState, missing } from './errors.ts'
import { nextDocumentNumber } from './numbering.ts'
import { dateOnly, hash, key, kind, optionalText, positiveAmount, text, uuid } from './validation.ts'
import type { TradeContext } from './context.ts'
import type { Actor } from '../identity/types.ts'
import type { CompanyAction, CreatePaymentInput, FinancialMutation, PaymentKind, ReverseDocumentInput } from './types.ts'
interface PaymentRow {
  id: string; kind: PaymentKind; party_id: string; paid_on: string; control_account_id: string; bank_account_id: string
  currency: string; amount_minor: string; number: string | null; status: 'draft' | 'posted' | 'reversed' | 'voided'
  request_key: string; fingerprint: string; journal_id: string | null; reversal_journal_id: string | null
  reference: string | null; description: string
}
const paymentSelect = `SELECT id,kind,party_id,paid_on,control_account_id,bank_account_id,currency,
 CAST(amount_minor AS TEXT) AS amount_minor,number,status,request_key,fingerprint,journal_id,reversal_journal_id,reference,description FROM trade_payments`
export function createPaymentService(ctx: TradeContext) {
  const { db, authorize, party, book, account, audit, accounting, transaction } = ctx
  function load(actor: Actor, companyId: string, id: string): PaymentRow {
    return rowAs<PaymentRow>(db.prepare(`${paymentSelect} WHERE id=? AND organization_id=? AND company_id=?`).get(uuid(id, 'paymentId'), actor.organizationId, companyId)) ?? missing()
  }
  function applied(paymentId: string): bigint {
    const row = rowAs<{ amount: string }>(db.prepare(`SELECT bigint_total(a.amount_minor) AS amount FROM payment_allocations a
      WHERE a.payment_id=? AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)`).get(paymentId))
    return BigInt(row?.amount ?? '0')
  }
  function view(row: PaymentRow) {
    const used = applied(row.id)
    return { id: row.id, kind: row.kind, partyId: row.party_id, paidOn: row.paid_on,
      controlAccountId: row.control_account_id, bankAccountId: row.bank_account_id, currency: row.currency,
      amountMinor: row.amount_minor, number: row.number, allocatedMinor: used.toString(), unallocatedMinor: (row.status === 'posted' ? BigInt(row.amount_minor) - used : 0n).toString(),
      reference: row.reference, description: row.description, status: row.status,
      journalId: row.journal_id, reversalJournalId: row.reversal_journal_id }
  }
  function checkAccounts(actor: Actor, companyId: string, row: Pick<PaymentRow, 'kind'|'party_id'|'control_account_id'|'bank_account_id'>) {
    party(actor, row.party_id)
    account(actor, companyId, row.control_account_id, row.kind === 'receipt' ? 'asset' : 'liability')
    account(actor, companyId, row.bank_account_id, 'asset')
    if (row.control_account_id === row.bank_account_id) return invalid('Bank and control accounts must differ')
  }
  function createPayment(input: CreatePaymentInput) {
    const paymentKind = kind(input.kind, ['receipt','payment'] as const, 'payment kind')
    const partyId = uuid(input.partyId, 'partyId'), paidOn = dateOnly(input.paidOn, 'paidOn')
    const control = uuid(input.controlAccountId, 'controlAccountId'), bank = uuid(input.bankAccountId, 'bankAccountId')
    const amount = positiveAmount(input.amountMinor, 'Payment amount')
    const requestKey = key(input.requestKey, 'requestKey')
    const description = text(input.description, 'Payment description', 500)
    const reference = optionalText(input.reference, 'Reference', 160)
    const fingerprint = hash({ paymentKind, partyId, paidOn, control, bank, amount: amount.toString(), reference, description })
    return transaction(db, () => {
      const actor = authorize(input, 'payments.manage')
      const existing = rowAs<PaymentRow>(db.prepare(`${paymentSelect} WHERE organization_id=? AND company_id=? AND request_key=?`).get(actor.organizationId, input.companyId, requestKey))
      if (existing) {
        if (existing.fingerprint !== fingerprint) return conflict('Payment request key reused with different contents')
        return { ...view(existing), replayed: true }
      }
      const currency = book(actor, input.companyId).base_currency
      checkAccounts(actor, input.companyId, { kind: paymentKind, party_id: partyId, control_account_id: control, bank_account_id: bank })
      const id = randomUUID()
      db.prepare(`INSERT INTO trade_payments(id,organization_id,company_id,kind,party_id,paid_on,control_account_id,
       bank_account_id,currency,amount_minor,request_key,fingerprint,reference,description) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, actor.organizationId, input.companyId, paymentKind, partyId, paidOn, control, bank, currency,
          amount, requestKey, fingerprint, reference, description)
      audit(actor, input.companyId, 'trade.payment.create', 'trade_payment', id, { kind: paymentKind })
      return { ...view(load(actor, input.companyId, id)), replayed: false }
    })
  }
  function getPayment(input: CompanyAction & { paymentId: string }) {
    const actor = authorize(input, 'payments.read')
    return view(load(actor, input.companyId, input.paymentId))
  }
  function listPayments(input: CompanyAction & { kind?: PaymentKind; limit?: number }) {
    const actor = authorize(input, 'payments.read')
    const paymentKind = input.kind === undefined ? null : kind(input.kind, ['receipt','payment'] as const, 'payment kind')
    const limit = input.limit ?? 100
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid('Invalid list limit')
    return rowsAs<PaymentRow>(db.prepare(`${paymentSelect} WHERE organization_id=? AND company_id=? AND (? IS NULL OR kind=?)
      ORDER BY paid_on DESC,id DESC LIMIT ?`).all(actor.organizationId, input.companyId, paymentKind, paymentKind, limit)).map(view)
  }
  function postPayment(input: FinancialMutation) {
    return transaction(db, () => {
      const actor = authorize(input, 'payments.manage')
      authorize(input, 'accounting.post')
      const row = load(actor, input.companyId, input.id)
      if (row.status === 'posted') return { ...view(row), replayed: true }
      if (row.status !== 'draft') return invalidState('Only a draft payment can be posted')
      if (book(actor, input.companyId).base_currency !== row.currency) return invalid('Payment currency must match accounting base currency')
      checkAccounts(actor, input.companyId, row)
      const journalLines = row.kind === 'receipt'
        ? [{ accountId: row.bank_account_id, debitMinor: row.amount_minor, creditMinor: '0' },
          { accountId: row.control_account_id, debitMinor: '0', creditMinor: row.amount_minor }]
        : [{ accountId: row.control_account_id, debitMinor: row.amount_minor, creditMinor: '0' },
          { accountId: row.bank_account_id, debitMinor: '0', creditMinor: row.amount_minor }]
      const journal = accounting.postWithinTransaction({ ...input, date: row.paid_on,
        sourceType: 'trade.payment', sourceId: row.id, sourceEvent: 'post', idempotencyKey: `trade.payment.${row.id}`,
        description: row.description, lines: journalLines }, { allowDocumentSource: true })
      const number = nextDocumentNumber(db, actor, input.companyId, row.kind)
      db.prepare(`UPDATE trade_payments SET journal_id=?,number=?,status='posted'
        WHERE id=? AND organization_id=? AND company_id=? AND status='draft'`).run(journal.id, number, row.id, actor.organizationId, input.companyId)
      audit(actor, input.companyId, 'trade.payment.post', 'trade_payment', row.id, { kind: row.kind })
      return { ...view(load(actor, input.companyId, row.id)), replayed: false }
    })
  }
  function voidPayment(input: FinancialMutation) {
    return transaction(db, () => {
      const actor = authorize(input, 'payments.manage')
      const row = load(actor, input.companyId, input.id)
      if (row.status !== 'draft') return invalidState('Only drafts may be voided')
      db.prepare(`UPDATE trade_payments SET status='voided' WHERE id=? AND organization_id=? AND company_id=?`).run(row.id, actor.organizationId, input.companyId)
      audit(actor, input.companyId, 'trade.payment.void', 'trade_payment', row.id)
      return view(load(actor, input.companyId, row.id))
    })
  }
  function reversePayment(input: ReverseDocumentInput) {
    const date = dateOnly(input.reversedOn, 'reversedOn'), reason = text(input.reason, 'Reason', 500), requestKey = key(input.requestKey, 'requestKey')
    return transaction(db, () => {
      const actor = authorize(input, 'payments.manage')
      authorize(input, 'accounting.reverse')
      const row = load(actor, input.companyId, input.id)
      if ((row.status !== 'posted' && row.status !== 'reversed') || !row.journal_id) return invalidState('Only posted payments can be reversed')
      if (applied(row.id) !== 0n) return conflict('Reverse allocations before reversing the payment')
      const reversal = accounting.reverseWithinTransaction({ ...input, journalId: row.journal_id,
        date, reason, idempotencyKey: requestKey }, { allowDocumentSource: true })
      if (row.status === 'reversed') return { ...view(row), replayed: true }
      db.prepare(`UPDATE trade_payments SET reversal_journal_id=?,status='reversed'
        WHERE id=? AND organization_id=? AND company_id=?`).run(reversal.id, row.id, actor.organizationId, input.companyId)
      audit(actor, input.companyId, 'trade.payment.reverse', 'trade_payment', row.id, { reason })
      return { ...view(load(actor, input.companyId, row.id)), replayed: false }
    })
  }
  return Object.freeze({ createPayment, getPayment, listPayments, postPayment, voidPayment, reversePayment })
}
