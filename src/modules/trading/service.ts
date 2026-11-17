import type { DatabaseSync } from 'node:sqlite'
import { tradeContext } from './context.ts'
import { createContactService } from './contacts.ts'
import { createInvoiceService } from './invoices.ts'
import { createPaymentService } from './payments.ts'
import { createSettlementService } from './settlements.ts'
import { createRecordInvoiceService } from './record-invoice.ts'
import { createRecordPaymentService } from './record-payment.ts'
import { createCreditService } from './credits.ts'
/** A framework-independent business application layer. UI, AI and CLI use the same operations. */
export function createTradingService(db: DatabaseSync, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  const context = tradeContext(db, clock)
  return Object.freeze({ ...createContactService(context), ...createInvoiceService(context), ...createRecordInvoiceService(context),
    ...createPaymentService(context), ...createSettlementService(context), ...createRecordPaymentService(context), ...createCreditService(context) })
}
