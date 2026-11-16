import { randomUUID } from 'node:crypto'
import type { createIdentityService } from '../../modules/identity/service.ts'
import { IdentityError, unauthenticated, invalid } from '../../modules/identity/errors.ts'
import { requiredString, code as validatedCode, identifier, requestedStatus } from '../../modules/identity/validation.ts'

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
function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...headers } })
}
function bearerCookie(request: Request, isSecure: boolean) {
  const name = isSecure ? SESSION_COOKIE : LOCAL_COOKIE
  const cookie = request.headers.get('cookie') ?? ''
  for (const item of cookie.split(';')) {
    const [key, ...rest] = item.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}
function cookieHeader(token: string, isSecure: boolean) {
  return `${isSecure ? SESSION_COOKIE : LOCAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 60 * 60}${isSecure ? '; Secure' : ''}`
}
function clearCookie(isSecure: boolean) {
  return `${isSecure ? SESSION_COOKIE : LOCAL_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecure ? '; Secure' : ''}`
}
async function parseJson(request: Request): Promise<Record<string, unknown>> {
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
      if (size > MAX_JSON_BYTES) throw new IdentityError('VALIDATION_FAILED', 'JSON request too large')
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new IdentityError('VALIDATION_FAILED', 'Invalid JSON') }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new IdentityError('VALIDATION_FAILED', 'JSON object required')
  return value as Record<string, unknown>
}

function passwordInput(value: unknown): string {
  if (typeof value !== 'string') throw invalid('Password must be a string')
  return value
}
function companyInput(body: Record<string, unknown>) {
  return { code: validatedCode(body['code'], 'Company code'), name: requiredString(body['name'], 'Company name') }
}
function userInput(body: Record<string, unknown>) {
  return { username: validatedCode(body['username'], 'Username'), displayName: requiredString(body['displayName'], 'Display name'), password: passwordInput(body['password']) }
}
function roleInput(body: Record<string, unknown>): { scope: 'company' | 'organization'; code: string; name: string; permissions: string[] } {
  const scope = body['scope']
  if (scope !== 'company' && scope !== 'organization') throw new IdentityError('VALIDATION_FAILED', 'Invalid role scope')
  const permissions = body['permissions']
  if (!Array.isArray(permissions) || !permissions.every(p => typeof p === 'string')) throw new IdentityError('VALIDATION_FAILED', 'Invalid permissions')
  return { scope, code: validatedCode(body['code'], 'Role code'), name: requiredString(body['name'], 'Role name'), permissions: permissions as string[] }
}
function assignInput(body: Record<string, unknown>) {
  return { userId: identifier(body['userId']), roleId: identifier(body['roleId']), companyId: body['companyId'] == null ? null : identifier(body['companyId']) }
}

function assertSameOrigin(request: Request, url: URL) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (origin && origin !== url.origin) throw new IdentityError('PERMISSION_DENIED', 'Cross-origin request denied')
  if (fetchSite === 'cross-site') throw new IdentityError('PERMISSION_DENIED', 'Cross-site request denied')
}
function assertLocalOrTls(url: URL) {
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return false
  throw new IdentityError('PERMISSION_DENIED', 'HTTPS required outside local loopback')
}

/** Web Request/Response adapter: safe to mount behind a future TanStack Start server route.
 * Adapter must construct request.url from its configured, trusted public origin, not an unchecked Host/X-Forwarded header.
 */
export function createIdentityHttpHandler(identity: ReturnType<typeof createIdentityService>) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID()
    try {
      const url = new URL(request.url)
      const isSecure = assertLocalOrTls(url)
      if (!url.pathname.startsWith('/api/')) return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
      const method = request.method.toUpperCase()
      if (!['GET','POST','PATCH'].includes(method)) return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
      if (method !== 'GET') assertSameOrigin(request, url)
      if (method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await parseJson(request)
        const login = await identity.login({ organizationSlug: validatedCode(body['organizationSlug'], 'Organization slug'), username: validatedCode(body['username'], 'Username'), password: passwordInput(body['password']) })
        return response({ user: login.user, csrfToken: login.csrfToken, expiresAt: login.expiresAt }, 200, { 'Set-Cookie': cookieHeader(login.token, isSecure) })
      }
      const sessionToken = bearerCookie(request, isSecure)
      // All remaining routes require a live session; no public registration API exists.
      if (!sessionToken) throw unauthenticated()
      const session = identity.me(sessionToken)
      if (method === 'GET' && url.pathname === '/api/auth/session') return response(session)
      if (method !== 'GET') identity.verifyCsrf(sessionToken, request.headers.get('x-csrf-token'))
      if (method === 'POST' && url.pathname === '/api/auth/logout') {
        identity.logout(sessionToken)
        return response({ ok: true }, 200, { 'Set-Cookie': clearCookie(isSecure) })
      }
      if (method === 'POST' && url.pathname === '/api/auth/password') {
        const body = await parseJson(request)
        const result = await identity.changePassword({ sessionToken, oldPassword: passwordInput(body['oldPassword']), newPassword: passwordInput(body['newPassword']) })
        return response(result, 200, { 'Set-Cookie': clearCookie(isSecure) })
      }
      if (method === 'GET' && url.pathname === '/api/companies') return response({ items: identity.listCompanies({ sessionToken }) })
      if (method === 'POST' && url.pathname === '/api/companies') return response(identity.createCompany({ sessionToken, ...companyInput(await parseJson(request)) }), 201)
      if (method === 'GET' && url.pathname === '/api/users') return response({ items: identity.listUsers({ sessionToken }) })
      if (method === 'POST' && url.pathname === '/api/users') return response(await identity.createUser({ sessionToken, ...userInput(await parseJson(request)) }), 201)
      if (method === 'PATCH' && /^\/api\/users\/[0-9a-f-]+\/status$/u.test(url.pathname)) {
        const userId = identifier(url.pathname.split('/')[3])
        return response(identity.setUserStatus({ sessionToken, userId: identifier(userId), status: requestedStatus((await parseJson(request))['status']) }))
      }
      if (method === 'POST' && /^\/api\/users\/[0-9a-f-]+\/reset-password$/u.test(url.pathname)) {
        const userId = identifier(url.pathname.split('/')[3])
        return response(await identity.resetUserPassword({ sessionToken, userId: identifier(userId), newPassword: passwordInput((await parseJson(request))['newPassword']) }))
      }
      if (method === 'POST' && /^\/api\/users\/[0-9a-f-]+\/unlock$/u.test(url.pathname)) {
        const userId = identifier(url.pathname.split('/')[3])
        return response(identity.unlockUser({ sessionToken, userId }))
      }
      if (method === 'GET' && url.pathname === '/api/roles') return response({ items: identity.listRoles({ sessionToken }) })
      if (method === 'POST' && url.pathname === '/api/roles') return response(identity.createRole({ sessionToken, ...roleInput(await parseJson(request)) }), 201)
      if (method === 'POST' && url.pathname === '/api/roles/assign') return response(identity.assignRole({ sessionToken, ...assignInput(await parseJson(request)) }))
      if (method === 'POST' && url.pathname === '/api/roles/revoke') return response(identity.revokeRole({ sessionToken, assignmentId: identifier((await parseJson(request))['assignmentId']) }))
      if (method === 'GET' && url.pathname === '/api/roles/assignments') return response({ items: identity.listAssignments({ sessionToken, userId: identifier(url.searchParams.get('userId')) }) })
      if (method === 'GET' && url.pathname === '/api/audit') {
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50
        return response({ items: identity.readAudit({ sessionToken, limit }) })
      }
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
    } catch (error) {
      const code = error instanceof IdentityError ? error.code : 'INTERNAL_ERROR'
      const status = ({ VALIDATION_FAILED: 400, NOT_AUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, CONFLICT: 409 } as Record<string, number>)[code] ?? 500
      // Never expose database errors, stack traces, token values or plaintext passwords.
      return response({ error: { code, message: error instanceof IdentityError ? error.message : 'Internal server error' }, requestId }, status)
    }
  }
}
