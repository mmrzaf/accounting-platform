import type { TradeContext } from './context.ts'
import { createInvoiceService } from './invoices.ts'
import type { CreateInvoiceInput } from './types.ts'

/** Atomic creation and posting, for a single user action in the business UI or AI. */
export function createRecordInvoiceService(ctx: TradeContext) {
  const invoices = createInvoiceService(ctx)
  function recordInvoice(input: CreateInvoiceInput) {
    return ctx.transaction(ctx.db, () => {
      const draft = invoices.createInvoice(input)
      return invoices.postInvoice({ ...input, id: draft.id })
    })
  }
  return { recordInvoice }
}
