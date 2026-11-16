import { invalid } from './errors.ts'

export function requiredString(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw invalid(`${label} must be a nonempty string (max ${max} characters)`)
  return value.trim()
}
export function code(value: unknown, label: string = 'Code') {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/u.test(value)) throw invalid(`${label} must start with a lowercase letter and contain only lowercase ASCII letters, digits, _ or - (2–64 characters)`)
  return value
}
export function identifier(value: unknown, label: string = 'Identifier') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) throw invalid(`Invalid ${label}`)
  return value
}
export function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 1024 || /\u0000/u.test(value)) {
    throw invalid('Password must contain at least 12 characters and at most 1024 UTF-8 bytes')
  }
  return value
}
export function requestedStatus(value: unknown): 'active' | 'disabled' {
  if (value !== 'active' && value !== 'disabled') throw invalid('Invalid user status')
  return value
}
