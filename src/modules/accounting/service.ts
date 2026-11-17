import type { DatabaseSync } from 'node:sqlite'
import { accountingContext } from './context.ts'
import { createBookService } from './books.ts'
import { createChartService } from './accounts.ts'
import { createPostingService } from './posting.ts'
import { createReportingService } from './reporting.ts'
import { createPostingDefaultsService } from './defaults.ts'
import { createStarterChartService } from './starter.ts'
/** Framework-neutral entry point, intended for UI, CLI and AI adapters alike. */
export function createAccountingService(db: DatabaseSync, { clock = () => new Date() }: {
  clock?: () => Date
} = {}) {
  const context = accountingContext(db, clock)
  const posting = createPostingService(context)
  // The document-only reversal entry point is intentionally NOT part of the public accounting facade.
  return Object.freeze({
    ...createBookService(context),
    ...createChartService(context),
    postJournal: posting.postJournal,
    postWithinTransaction: (input: Parameters<typeof posting.postWithinTransaction>[0]) => posting.postWithinTransaction(input),
    getJournal: posting.getJournal,
    reverseJournal: posting.reverseJournal,
    ...createReportingService(context),
    ...createPostingDefaultsService(context),
    ...createStarterChartService(context),
  })
}
