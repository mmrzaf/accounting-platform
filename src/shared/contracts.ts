export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_AUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STATE_CONFLICT'
  | 'INTERNAL_ERROR'

export type ApplicationResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: { readonly code: ErrorCode; readonly message: string; readonly correlationId?: string }
    }

export interface Paginated<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}

/** Never serialize BigInt to JSON as a number; amounts will have explicit decimal contracts. */
export interface DecimalMoneyWire {
  readonly currencyCode: string
  readonly minorUnits: string
  readonly scale: number
}
