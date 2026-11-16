export type AccountingErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'PERIOD_CLOSED' | 'UNBALANCED' | 'AMOUNT_OUT_OF_RANGE' | 'IMMUTABLE'
/** Financial-domain failure, distinct from authentication/authorization failures. */
export class AccountingError extends Error {
  readonly code: AccountingErrorCode
  constructor(code: AccountingErrorCode, message: string) {
    super(message)
    this.name = 'AccountingError'
    this.code = code
  }
}
export const invalid = (message: string): never => { throw new AccountingError('INVALID_INPUT', message); }
export const missing = (): never => { throw new AccountingError('NOT_FOUND', 'Accounting record not found'); }
export const conflict = (message: string): never => { throw new AccountingError('CONFLICT', message); }
export const closed = (): never => { throw new AccountingError('PERIOD_CLOSED', 'Fiscal period is closed'); }
