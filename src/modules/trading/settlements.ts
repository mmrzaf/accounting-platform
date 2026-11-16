import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, missing } from './errors.ts'
import { hash, key, positiveAmount, text, uuid } from './validation.ts'
import type { TradeContext } from './context.ts'
import type { Actor } from '../identity/types.ts'
import type { AllocatePaymentInput, CompanyAction, ReverseAllocationInput } from './types.ts'
interface AllocationRow { id: string; invoice_id: string; payment_id: string; amount_minor: string; request_key: string; fingerprint: string }
interface ReversalRow { id: string; allocation_id: string; reason: string; request_key: string; fingerprint: string }
interface SourceRow { id: string; kind: string; party_id: string; status: string; currency: string; control_account_id: string; amount_minor: string }
const allocationSelect = `SELECT id,invoice_id,payment_id,CAST(amount_minor AS TEXT) AS amount_minor,request_key,fingerprint FROM payment_allocations`
export function createSettlementService(ctx: TradeContext) {
  const { db, authorize, audit, transaction } = ctx
  function allocation(actor: Actor, companyId: string, id: string): AllocationRow {
    return rowAs<AllocationRow>(db.prepare(`${allocationSelect} WHERE organization_id=? AND company_id=? AND id=?`).get(actor.organizationId, companyId, uuid(id, 'allocationId'))) ?? missing()
  }
  function visible(row: AllocationRow) {
    const reversal = rowAs<ReversalRow>(db.prepare('SELECT id,allocation_id,reason,request_key,fingerprint FROM allocation_reversals WHERE allocation_id=?').get(row.id))
    return { id: row.id, invoiceId: row.invoice_id, paymentId: row.payment_id, amountMinor: row.amount_minor,
      reversed: !!reversal, reversalId: reversal?.id ?? null }
  }
  function source(actor: Actor, companyId: string, id: string, table: 'trade_invoices' | 'trade_payments'): SourceRow {
    const amount = table === 'trade_invoices' ? 'total_minor' : 'amount_minor'
    return rowAs<SourceRow>(db.prepare(`SELECT id,kind,party_id,status,currency,control_account_id,CAST(${amount} AS TEXT) AS amount_minor
      FROM ${table} WHERE organization_id=? AND company_id=? AND id=?`).get(actor.organizationId, companyId, uuid(id, 'sourceId'))) ?? missing()
  }
  function used(id: string, column: 'invoice_id' | 'payment_id'): bigint {
    const row = rowAs<{ amount: string }>(db.prepare(`SELECT bigint_total(a.amount_minor) AS amount FROM payment_allocations a
      WHERE a.${column}=? AND NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)`).get(id))
    return BigInt(row?.amount ?? '0')
  }
  function allocatePayment(input: AllocatePaymentInput) {
    const invoiceId = uuid(input.invoiceId, 'invoiceId'), paymentId = uuid(input.paymentId, 'paymentId')
    const amount = positiveAmount(input.amountMinor, 'Allocation amount')
    const requestKey = key(input.requestKey, 'requestKey')
    const fingerprint = hash({ invoiceId, paymentId, amount: amount.toString() })
    return transaction(db, () => {
      const actor = authorize(input, 'payments.manage')
      const existing = rowAs<AllocationRow>(db.prepare(`${allocationSelect} WHERE organization_id=? AND company_id=? AND request_key=?`)
        .get(actor.organizationId, input.companyId, requestKey))
      if (existing) {
        if (existing.fingerprint !== fingerprint) return conflict('Allocation request key reused with different contents')
        return { ...visible(existing), replayed: true }
      }
      const invoice = source(actor, input.companyId, invoiceId, 'trade_invoices')
      const payment = source(actor, input.companyId, paymentId, 'trade_payments')
      if (invoice.status !== 'posted' || payment.status !== 'posted') return conflict('Only posted financial documents can be allocated')
      if (invoice.party_id !== payment.party_id || invoice.currency !== payment.currency || invoice.control_account_id !== payment.control_account_id ||
        (invoice.kind === 'sale' && payment.kind !== 'receipt') || (invoice.kind === 'purchase' && payment.kind !== 'payment'))
        return conflict('Payment and invoice must match in party, currency, control account and direction')
      if (used(invoiceId, 'invoice_id') + amount > BigInt(invoice.amount_minor)) return conflict('Allocation exceeds invoice outstanding balance')
      if (used(paymentId, 'payment_id') + amount > BigInt(payment.amount_minor)) return conflict('Allocation exceeds unapplied payment amount')
      const id = randomUUID()
      db.prepare(`INSERT INTO payment_allocations(id,organization_id,company_id,invoice_id,payment_id,amount_minor,request_key,fingerprint)
        VALUES(?,?,?,?,?,?,?,?)`).run(id, actor.organizationId, input.companyId, invoiceId, paymentId, amount, requestKey, fingerprint)
      audit(actor, input.companyId, 'trade.allocation.create', 'payment_allocation', id, { invoiceId, paymentId, amountMinor: amount.toString() })
      return { ...visible(allocation(actor, input.companyId, id)), replayed: false }
    })
  }
  function reverseAllocation(input: ReverseAllocationInput) {
    const id = uuid(input.allocationId, 'allocationId'), reason = text(input.reason, 'Reason', 500)
    const requestKey = key(input.requestKey, 'requestKey'), fingerprint = hash({ id, reason })
    return transaction(db, () => {
      const actor = authorize(input, 'payments.manage')
      const existing = rowAs<ReversalRow>(db.prepare('SELECT id,allocation_id,reason,request_key,fingerprint FROM allocation_reversals WHERE organization_id=? AND company_id=? AND request_key=?')
        .get(actor.organizationId, input.companyId, requestKey))
      if (existing) {
        if (existing.fingerprint !== fingerprint) return conflict('Reversal request key reused with different contents')
        return { ...visible(allocation(actor, input.companyId, existing.allocation_id)), replayed: true }
      }
      const record = allocation(actor, input.companyId, id)
      const already = rowAs<ReversalRow>(db.prepare('SELECT id,allocation_id,reason,request_key,fingerprint FROM allocation_reversals WHERE allocation_id=?').get(record.id))
      if (already) return conflict('Allocation already reversed')
      const reversalId = randomUUID()
      db.prepare(`INSERT INTO allocation_reversals(id,organization_id,company_id,allocation_id,reason,request_key,fingerprint)
        VALUES(?,?,?,?,?,?,?)`).run(reversalId, actor.organizationId, input.companyId, record.id, reason, requestKey, fingerprint)
      audit(actor, input.companyId, 'trade.allocation.reverse', 'payment_allocation', record.id, { reason })
      return { ...visible(record), replayed: false }
    })
  }
  function listAllocations(input: CompanyAction & { invoiceId?: string; paymentId?: string }) {
    const actor = authorize(input, 'payments.read')
    if (input.invoiceId === undefined && input.paymentId === undefined) return conflict('Specify invoiceId or paymentId')
    const invoiceId = input.invoiceId === undefined ? null : uuid(input.invoiceId, 'invoiceId')
    const paymentId = input.paymentId === undefined ? null : uuid(input.paymentId, 'paymentId')
    return rowsAs<AllocationRow>(db.prepare(`${allocationSelect} WHERE organization_id=? AND company_id=?
      AND (? IS NULL OR invoice_id=?) AND (? IS NULL OR payment_id=?) ORDER BY rowid LIMIT 200`)
      .all(actor.organizationId, input.companyId, invoiceId, invoiceId, paymentId, paymentId)).map(visible)
  }
  return Object.freeze({ allocatePayment, reverseAllocation, listAllocations })
}
