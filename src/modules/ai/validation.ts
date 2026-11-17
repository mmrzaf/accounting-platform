import { createHash } from 'node:crypto'
import { aiError } from './errors.ts'

export function required(value: unknown, name: string, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000e-\u001f]/u.test(value))
    return aiError('INVALID_INPUT', `Invalid ${name}`)
  return value.trim()
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return aiError('PROVIDER_RESPONSE_INVALID', 'Tool arguments must be an object')
  return value as Record<string, unknown>
}
export function fields(value: unknown, allowed: readonly string[], requiredFields: readonly string[] = []): Record<string, unknown> {
  const v = object(value)
  if (Object.keys(v).some(key => !allowed.includes(key)) || requiredFields.some(key => !(key in v)))
    return aiError('PROVIDER_RESPONSE_INVALID', 'Tool arguments do not match the contract')
  return v
}
export function stringField(value: unknown, field: string, limit = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) return aiError('PROVIDER_RESPONSE_INVALID', `Invalid ${field}`)
  return value.trim()
}
export function optionalString(value: unknown, field: string, limit = 500): string | undefined {
  return value === undefined ? undefined : stringField(value, field, limit)
}
export function sha(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function json(value: unknown): string { return JSON.stringify(value) }
export function decodeArgs(raw: string): unknown {
  if (typeof raw !== 'string' || raw.length > 20000) return aiError('PROVIDER_RESPONSE_INVALID', 'Invalid tool arguments size')
  try { return JSON.parse(raw) as unknown } catch { return aiError('PROVIDER_RESPONSE_INVALID', 'Invalid tool arguments JSON') }
}
