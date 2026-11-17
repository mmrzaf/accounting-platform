export interface ApiErrorBody { error?: { code?: string; message?: string }; requestId?: string }
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | undefined
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}
export interface AuthSession {
  user: { id: string; username: string; displayName: string }
  organization: { id: string; slug: string; name: string }
  csrfToken: string
}
export interface Company { id: string; code: string; name: string; status: string }
export interface Contact { id: string; displayName: string; code: string | null; status: string }
export interface Account { id: string; code: string; name: string; category: 'asset'|'liability'|'equity'|'revenue'|'expense'; postable: boolean; active: boolean }
export interface Book { company_id: string; base_currency: string; timezone: string }
export interface Currency { code: string; name: string; decimals: number }
export interface Invoice { id: string; kind: 'sale'|'purchase'; partyId: string; issuedOn: string; status: string; number: string|null; totalMinor: string; description: string; lines?: {id: string; description: string; quantityMilli: string; lineTotalMinor: string}[] }
export interface Payment { id: string; kind: 'receipt'|'payment'; partyId: string; paidOn: string; amountMinor: string; status: string; description: string }
export interface TrialBalance { baseCurrency: string; totalDebitMinor: string; totalCreditMinor: string; rows: { accountId: string; code: string; name: string; category: string; balanceDebitMinor: string; balanceCreditMinor: string }[] }
export interface FinancialSummary { baseCurrency: string; assetsMinor: string; liabilitiesMinor: string; equityMinor: string; revenueMinor: string; expensesMinor: string; netIncomeMinor: string }
export interface StockItem { id: string; sku: string; name: string; unit: string; status: string; quantityMilli: string }
export interface List<T> { items: T[] }

export async function request<T>(path: string, csrf?: string, payload?: unknown, method = payload === undefined ? 'GET' : 'POST'): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (payload !== undefined) headers['content-type'] = 'application/json'
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf
  let result: Response
  try { result = await fetch(path, { method, headers, credentials: 'same-origin', ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }) }
  catch { throw new ApiError(0, 'NETWORK_UNAVAILABLE', 'Cannot connect to the local application server') }
  const json: unknown = await result.json().catch(() => undefined)
  if (!result.ok) {
    const body = json as ApiErrorBody | undefined
    throw new ApiError(result.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Request failed (${result.status})`, body?.requestId)
  }
  return json as T
}
export function scoped(path: string, companyId: string, params: Record<string, string> = {}) {
  const [pathname, query] = path.split('?', 2)
  const search = new URLSearchParams(query ?? '')
  search.set('companyId', companyId)
  for (const [key, value] of Object.entries(params)) search.set(key, value)
  return `${pathname}?${search}`
}
export const newRequestKey = () => crypto.randomUUID()

// Convert localized digit input with exact bigint arithmetic. Never use floating-point amounts.
export function canonicalDigits(value: string) {
  return value.replace(/[۰-۹]/gu, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[٠-٩]/gu, digit => String(digit.charCodeAt(0) - 0x660))
}
export function majorToMinor(value: string, decimals: number): string {
  const cleaned = canonicalDigits(value.trim()).replaceAll(',', '')
  if (!/^\d+(?:\.\d+)?$/u.test(cleaned)) throw Error('Enter a valid nonnegative amount')
  const [whole = '0', fraction = ''] = cleaned.split('.')
  if (fraction.length > decimals) throw Error(`Amount supports at most ${decimals} decimal places`)
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')).toString()
}
export function money(minor: string, decimals: number, locale: 'fa'|'en', currency?: string) {
  const neg = minor.startsWith('-')
  const value = BigInt(neg ? minor.slice(1) : minor)
  const power = 10n ** BigInt(decimals)
  const whole = (value / power).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')
  const fraction = decimals ? `.${(value % power).toString().padStart(decimals, '0')}` : ''
  return `${neg ? '−' : ''}${whole}${fraction}${currency ? ` ${currency}` : ''}`
}
export function today(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
