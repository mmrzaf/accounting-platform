import { createHash } from 'node:crypto'
import type { TradeContext } from './context.ts'
import type { CreateInvoiceInput } from './types.ts'
import { createRecordInvoiceService } from './record-invoice.ts'
import { createRecordPaymentService } from './record-payment.ts'
import { invalid } from './errors.ts'
import { positiveAmount } from './validation.ts'

/** One financial command; posted invoice + optional fully allocated part-payment.
 * All service calls share the transaction and their normal permission checks.
 * It records an existing payment in the books, never initiates a bank transfer.
 */
export function createRecordTradeService(ctx: TradeContext) {
  const invoices = createRecordInvoiceService(ctx)
  const payments = createRecordPaymentService(ctx)
  function recordTrade(input: CreateInvoiceInput & {
    expectedTotalMinor?: string
    paidMinor?: string
    paidOn?: string
    bankAccountId?: string
  }) {
    if (input.paidMinor === undefined && (input.paidOn !== undefined || input.bankAccountId !== undefined))
      return invalid('Payment details require a payment amount')
    if (input.paidMinor !== undefined && (input.paidOn === undefined || input.bankAccountId === undefined))
      return invalid('Payment date and bank account are required for a partial payment')
    const paid = input.paidMinor === undefined ? null : positiveAmount(input.paidMinor, 'Paid amount')
    return ctx.transaction(ctx.db, () => {
      const invoice = invoices.recordInvoice(input)
      if(input.expectedTotalMinor!==undefined && positiveAmount(input.expectedTotalMinor,'Expected total')!==BigInt(invoice.totalMinor))
        return invalid('Calculated invoice total differs from the confirmed total')
      if (paid === null) return { invoice, payment: null, allocation: null }
      if (paid > BigInt(invoice.totalMinor)) return invalid('Paid amount cannot exceed invoice total')
      const payment = payments.recordPayment({
        sessionToken: input.sessionToken, companyId: input.companyId,
        kind: input.kind === 'sale' ? 'receipt' : 'payment', partyId: input.partyId,
        paidOn: input.paidOn!, controlAccountId: input.controlAccountId,
        bankAccountId: input.bankAccountId!, amountMinor: paid.toString(),
        description: `Settlement of ${invoice.number ?? 'invoice'}`,
        requestKey: createHash('sha256').update(`trade-payment:${input.requestKey}`).digest('hex'),
        invoiceId: invoice.id, allocationMinor: paid.toString(),
      })
      return { invoice, payment: payment.payment, allocation: payment.allocation }
    })
  }
  return { recordTrade }
}
