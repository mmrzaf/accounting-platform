import { createHash } from 'node:crypto'
import { MAX_SQLITE_INTEGER, roundRatio } from '../accounting/money.ts'
import { dateOnly, key, optionalText, text, uuid } from '../accounting/validation.ts'
import { invalid } from './errors.ts'
import type { InvoiceLineInput, ItemKind } from './types.ts'
export { dateOnly, key, optionalText, text, uuid }
export const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function kind<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return invalid(`Invalid ${label}`)
  return value as T
}
export function positiveAmount(value: unknown, name: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) return invalid(`${name} must be a positive canonical minor-unit integer string`)
  const amount = BigInt(value)
  if (amount > MAX_SQLITE_INTEGER) return invalid(`${name} exceeds SQLite integer range`)
  return amount
}
export function quantityMilli(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,3})?$/u.test(value)) return invalid('Quantity must be a nonnegative decimal with up to three places')
  const [integer, fractional = ''] = value.split('.')
  if (!integer) return invalid('Invalid quantity')
  const qty = BigInt(integer) * 1000n + BigInt(fractional.padEnd(3, '0'))
  if (qty === 0n || qty > MAX_SQLITE_INTEGER) return invalid('Quantity must be positive and in range')
  return qty
}
export interface ValidLine {
  itemKind: ItemKind
  description: string
  quantityMilli: bigint
  unitPriceMinor: bigint
  lineTotalMinor: bigint
  accountId: string
}
export function linesOf(value: unknown): { lines: ValidLine[]; total: bigint } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return invalid('An invoice requires 1–100 lines')
  const lines = (value as InvoiceLineInput[]).map((line, index): ValidLine => {
    if (!line || typeof line !== 'object') return invalid(`Invalid line ${index + 1}`)
    const itemKind = kind(line.itemKind, ['service', 'non_stock', 'good'] as const, 'item kind')
    const description = text(line.description, 'Line description', 500)
    const quantity = quantityMilli(line.quantity)
    const unit = positiveAmount(line.unitPriceMinor, 'Unit price')
    const subtotal = roundRatio(quantity * unit, 1000n)
    if (subtotal === 0n || subtotal > MAX_SQLITE_INTEGER) return invalid('Line total is zero or too large')
    return { itemKind, description, quantityMilli: quantity, unitPriceMinor: unit, lineTotalMinor: subtotal, accountId: uuid(line.accountId, 'accountId') }
  })
  const total = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0n)
  if (total > MAX_SQLITE_INTEGER) return invalid('Invoice total exceeds SQLite integer range')
  return { lines, total }
}
