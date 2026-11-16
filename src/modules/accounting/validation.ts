import { invalid } from './errors.ts'
export function text(value: unknown, name: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value))
    return invalid(`${name} must be nonempty text up to ${max} characters`)
  return value.trim()
}
export function optionalText(value: unknown, name: string, max = 500): string | null {
  if (value === undefined || value === null || value === '')
    return null
  return text(value, name, max)
}
export function key(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value))
    return invalid(`${name} must be a stable ASCII key (1-128 chars)`)
  return value
}
export function dateOnly(value: unknown, name = 'date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return invalid(`${name} must be YYYY-MM-DD`)
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined || year < 1 || year > 9999)
    return invalid(`Invalid ${name}`)
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day)
    return invalid(`Invalid ${name}`)
  return value
}
export function uuid(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value))
    return invalid(`Invalid ${name}`)
  return value
}
export function timezone(value: unknown): string {
  const candidate = text(value, 'timezone', 80)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate })
  }
  catch {
    return invalid('Unsupported IANA timezone')
  }
  return candidate
}
