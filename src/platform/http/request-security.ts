import { IdentityError } from '../../modules/identity/errors.ts'

const SESSION_COOKIE = '__Host-accounting_session'
const LOCAL_COOKIE = 'accounting_session'
const MAX_JSON_BYTES = 16 * 1024
const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
}
export function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...headers } })
}
export function bearerCookie(request: Request, isSecure: boolean) {
  const name = isSecure ? SESSION_COOKIE : LOCAL_COOKIE
  const cookie = request.headers.get('cookie') ?? ''
  for (const item of cookie.split(';')) {
    const [key, ...rest] = item.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}
export function cookieHeader(token: string, isSecure: boolean) {
  return `${isSecure ? SESSION_COOKIE : LOCAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 60 * 60}${isSecure ? '; Secure' : ''}`
}
export function clearCookie(isSecure: boolean) {
  return `${isSecure ? SESSION_COOKIE : LOCAL_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecure ? '; Secure' : ''}`
}
export async function parseJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') ?? '')) throw new IdentityError('VALIDATION_FAILED', 'JSON content type required')
  const reader = request.body?.getReader()
  if (!reader) throw new IdentityError('VALIDATION_FAILED', 'JSON body required')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new IdentityError('VALIDATION_FAILED', 'JSON request too large')
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new IdentityError('VALIDATION_FAILED', 'Invalid JSON') }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new IdentityError('VALIDATION_FAILED', 'JSON object required')
  return value as Record<string, unknown>
}

export function assertSameOrigin(request: Request, url: URL) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (origin && origin !== url.origin) throw new IdentityError('PERMISSION_DENIED', 'Cross-origin request denied')
  if (fetchSite === 'cross-site') throw new IdentityError('PERMISSION_DENIED', 'Cross-site request denied')
}
export function assertLocalOrTls(url: URL) {
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return false
  throw new IdentityError('PERMISSION_DENIED', 'HTTPS required outside local loopback')
}

