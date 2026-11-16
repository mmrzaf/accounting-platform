export type TradeErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID_STATE' | 'AMOUNT_OUT_OF_RANGE'
export class TradeError extends Error {
  readonly code: TradeErrorCode
  constructor(code: TradeErrorCode, message: string) { super(message); this.name = 'TradeError'; this.code = code }
}
export const invalid = (message: string): never => { throw new TradeError('INVALID_INPUT', message) }
export const missing = (): never => { throw new TradeError('NOT_FOUND', 'Business record not found') }
export const conflict = (message: string): never => { throw new TradeError('CONFLICT', message) }
export const invalidState = (message: string): never => { throw new TradeError('INVALID_STATE', message) }
