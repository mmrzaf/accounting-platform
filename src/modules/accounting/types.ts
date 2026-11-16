import type { FxRate } from './money.ts'
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export interface ScopedAction {
  sessionToken: string
  companyId: string
}
export interface SetupBookInput extends ScopedAction {
  baseCurrency: string
  baseDecimals: number
  timezone: string
}
export interface CurrencyInput extends ScopedAction {
  code: string
  decimals: number
  name: string
}
export interface PeriodInput extends ScopedAction {
  code: string
  startsOn: string
  endsOn: string
}
export interface PeriodStatusInput extends ScopedAction {
  periodId: string
  status: 'open' | 'closed'
}
export interface AccountInput extends ScopedAction {
  code: string
  name: string
  category: AccountCategory
  parentId?: string | null
  postable?: boolean
}
export interface JournalLineInput {
  accountId: string
  debitMinor: string
  creditMinor: string
  memo?: string
  foreign?: {
    currency: string
    amountMinor: string
    rate: FxRate
  }
}
export interface PostJournalInput extends ScopedAction {
  date: string
  sourceType: string
  sourceId: string
  sourceEvent: string
  idempotencyKey: string
  description: string
  lines: JournalLineInput[]
}
export interface ReverseJournalInput extends ScopedAction {
  journalId: string
  date: string
  idempotencyKey: string
  reason: string
}
export interface LedgerQuery extends ScopedAction {
  accountId: string
  from?: string
  through?: string
  limit?: number
  offset?: number
}
export interface TrialBalanceQuery extends ScopedAction {
  through?: string
}
