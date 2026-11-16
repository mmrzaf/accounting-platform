import type { DatabaseSync } from 'node:sqlite'
import { accountingContext } from './context.ts'
import { createBookService } from './books.ts'
import { createChartService } from './accounts.ts'
import { createPostingService } from './posting.ts'
import { createReportingService } from './reporting.ts'
/** Framework-neutral entry point, intended for UI, CLI and AI adapters alike. */
export function createAccountingService(db: DatabaseSync, { clock = () => new Date() }: {
  clock?: () => Date
} = {}) {
  const context = accountingContext(db, clock)
  return Object.freeze({
    ...createBookService(context),
    ...createChartService(context),
    ...createPostingService(context),
    ...createReportingService(context),
  })
}
