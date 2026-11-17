import { createHash } from 'node:crypto'
import type { TradeContext } from './context.ts'
import type { CreatePaymentInput } from './types.ts'
import { createPaymentService } from './payments.ts'
import { createSettlementService } from './settlements.ts'
import { positiveAmount, uuid } from './validation.ts'
import { invalid } from './errors.ts'

/** One atomic business command: create, post and optionally settle an invoice.
 * The constituent application services own validation, authorization and accounting.
 * A failure at any step rolls back the entire command and audit trail. */
export function createRecordPaymentService(ctx: TradeContext) {
  const payments = createPaymentService(ctx)
  const settlements = createSettlementService(ctx)
  function recordPayment(input: CreatePaymentInput & { invoiceId?: string; allocationMinor?: string }) {
    if ((input.invoiceId === undefined) !== (input.allocationMinor === undefined))
      return invalid('Invoice and allocation amount must be provided together')
    const invoiceId = input.invoiceId === undefined ? null : uuid(input.invoiceId, 'invoiceId')
    const allocation = input.allocationMinor === undefined ? null : positiveAmount(input.allocationMinor, 'Allocation amount')
    if (allocation !== null && allocation > BigInt(input.amountMinor)) return invalid('Allocation cannot exceed payment amount')
    return ctx.transaction(ctx.db, () => {
      const draft = payments.createPayment(input)
      const payment = payments.postPayment({ ...input, id: draft.id })
      const applied = invoiceId === null || allocation === null ? null : settlements.allocatePayment({
        ...input, invoiceId, paymentId: payment.id, amountMinor: allocation.toString(),
        requestKey: createHash('sha256').update(`payment-allocation:${input.requestKey}:${invoiceId}:${allocation}`).digest('hex'),
      })
      return { payment, allocation: applied }
    })
  }
  return { recordPayment }
}
