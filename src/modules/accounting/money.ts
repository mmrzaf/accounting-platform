import { AccountingError, invalid } from './errors.ts'
export const MAX_SQLITE_INTEGER = 9223372036854775807n
/** Validate a non-negative, canonical decimal integer for SQL INTEGER binding. */
export function minorUnits(value: unknown, label = 'amount'): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value))
    return invalid(`${label} must be a canonical non-negative integer string`)
  const number = BigInt(value)
  if (number > MAX_SQLITE_INTEGER)
    throw new AccountingError('AMOUNT_OUT_OF_RANGE', `${label} exceeds signed SQLite INTEGER range`)
  return number
}
export function positiveMinorUnits(value: unknown, label = 'amount'): bigint {
  const number = minorUnits(value, label)
  if (number === 0n)
    return invalid(`${label} must be positive`)
  return number
}
/** Rate is exact: base minor units per transaction minor unit = numerator / denominator. */
export interface FxRate {
  numerator: string
  denominator: string
  date: string
  source: string
}
const RATE_MAX_DIGITS = 32
export function positiveRatePart(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value) || value.length > RATE_MAX_DIGITS)
    return invalid(`${label} must be a positive decimal integer of at most ${RATE_MAX_DIGITS} digits`)
  return BigInt(value)
}
/** Half-to-even, including exact ties; no Number conversion at any stage. */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n)
    return invalid('Invalid unsigned ratio')
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const doubleRemainder = remainder * 2n
  return doubleRemainder > denominator || (doubleRemainder === denominator && quotient % 2n === 1n) ? quotient + 1n : quotient
}
export function convertedMinorUnits(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  const result = roundRatio(amount * numerator, denominator)
  if (result > MAX_SQLITE_INTEGER)
    throw new AccountingError('AMOUNT_OUT_OF_RANGE', 'Converted amount exceeds SQLite INTEGER range')
  return result
}
export function currencyCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/u.test(value))
    return invalid('Currency code must be three uppercase ASCII letters')
  return value
}
export function currencyDecimals(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6)
    return invalid('Currency precision must be an integer from 0 through 6')
  return value
}
export function exactSum(values: Iterable<bigint>): bigint {
  let total = 0n
  for (const value of values)
    total += value
  return total
}
