import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createIdentityHttpHandler } from '../../src/platform/http/identity-handler.ts'

const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const password = 'a reasonably secure initial password'
type IdentityService = ReturnType<typeof createIdentityService>
type IdentityHandler = ReturnType<typeof createIdentityHttpHandler>
interface RequestOptions { method?: string; body?: unknown; cookie?: string; csrf?: string; origin?: string; extra?: Record<string, string>; base?: string }
interface HttpJson { id: string; password?: string; csrfToken: string; token?: string; items: { id: string; code: string }[] }
const readJson = async (response: Response): Promise<HttpJson> => (await response.json()) as HttpJson
async function withHandler<T>(fn: (handler: IdentityHandler, service: IdentityService) => T | Promise<T>): Promise<T> {
  const db = openDatabase(':memory:')
  applyMigrations(db, migrations)
  const svc = createIdentityService(db)
  await svc.bootstrapOrganization({ slug: 'acme', name: 'ACME Ltd', adminUsername: 'admin', adminDisplayName: 'Admin', password })
  try { return await fn(createIdentityHttpHandler(svc), svc) } finally { db.close() }
}
function req(path: string, { method = 'GET', body, cookie, csrf, origin, extra = {}, base = 'http://localhost:3000' }: RequestOptions = {}) {
  return new Request(`${base}${path}`, { method, headers: {
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(origin ? { origin } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
async function signedIn(handler: IdentityHandler) {
  const login = await handler(req('/api/auth/login', { method: 'POST', body: { organizationSlug: 'acme', username: 'admin', password }, origin: 'http://localhost:3000' }))
  assert.equal(login.status, 200)
  const data = await readJson(login)
  assert.equal(data.token, undefined)
  assert.equal(login.headers.get('cache-control'), 'no-store')
  return { cookie: login.headers.get('set-cookie')!.split(';')[0]!, csrf: data.csrfToken }
}

test('HTTP login issues HttpOnly cookie, session endpoint recovers CSRF, logout clears cookie', async () => withHandler(async handler => {
  const { cookie, csrf } = await signedIn(handler)
  assert.match(cookie, /^accounting_session=/u)
  const session = await handler(req('/api/auth/session', { cookie }))
  assert.equal(session.status, 200)
  assert.equal((await readJson(session)).csrfToken, csrf)
  const missingCsrf = await handler(req('/api/auth/logout', { method: 'POST', cookie, body: {} }))
  assert.equal(missingCsrf.status, 403)
  const logout = await handler(req('/api/auth/logout', { method: 'POST', cookie, csrf, body: {} }))
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/u)
  assert.equal((await handler(req('/api/auth/session', { cookie }))).status, 401)
}))

test('HTTP rejects cross origin, insecure remote, oversized JSON and unauthorized routes', async () => withHandler(async handler => {
  const { cookie, csrf } = await signedIn(handler)
  assert.equal((await handler(req('/api/auth/session'))).status, 401)
  assert.equal((await handler(req('/api/users', { cookie }))).status, 200)
  assert.equal((await handler(req('/api/companies', { cookie, base: 'http://lan.example.com' }))).status, 403)
  assert.equal((await handler(req('/api/users', { method: 'POST', cookie, csrf, origin: 'https://evil.example', body: { username: 'forged' } }))).status, 403)
  assert.equal((await handler(req('/api/users', { method: 'POST', cookie, csrf, extra: { 'sec-fetch-site': 'cross-site' }, body: {} }))).status, 403)
  assert.equal((await handler(req('/api/users', { method: 'POST', cookie, csrf, body: { username: 'attacker', displayName: 'Attacker', password: 'p'.repeat(17000) } }))).status, 400)
  assert.equal((await handler(req('/api/private', { cookie }))).status, 404)
  const secure = await handler(req('/api/auth/login', { base: 'https://example.test', method: 'POST', body: { organizationSlug: 'acme', username: 'admin', password } }))
  assert.match(secure.headers.get('set-cookie')!, /^__Host-accounting_session=.*; Secure$/u)
}))

test('HTTP mutations enforce server authorization, not attacker supplied actor scope', async () => withHandler(async (handler, svc) => {
  const admin = await signedIn(handler)
  const user = await handler(req('/api/users', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { username: 'employee', displayName: 'Employee', password } }))
  assert.equal(user.status, 201)
  const created = await readJson(user)
  assert.equal(created.password, undefined)
  const employeeLogin = await handler(req('/api/auth/login', { method: 'POST', body: { organizationSlug: 'acme', username: 'employee', password } }))
  const employee = { cookie: employeeLogin.headers.get('set-cookie')!.split(';')[0]!, csrf: (await readJson(employeeLogin)).csrfToken }
  assert.equal((await handler(req('/api/users', { cookie: employee.cookie }))).status, 403)
  assert.equal((await handler(req('/api/companies', { cookie: employee.cookie }))).status, 200)
  assert.deepEqual((await readJson(await handler(req('/api/companies', { cookie: employee.cookie })))).items, [])
  const roles = await readJson(await handler(req('/api/roles', { cookie: admin.cookie })))
  const company = svc.listCompanies({ sessionToken: admin.cookie.split('=')[1]! })[0]
  const reader = roles.items.find(r => r.code === 'company-reader')
  const assigned = await handler(req('/api/roles/assign', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { userId: created.id, roleId: reader!.id, companyId: company!.id } }))
  assert.equal(assigned.status, 200)
  assert.equal((await readJson(await handler(req('/api/companies', { cookie: employee.cookie })))).items.length, 1)
  assert.equal((await handler(req('/api/roles/assign', { method: 'POST', cookie: employee.cookie, csrf: employee.csrf, body: { userId: created.id, roleId: reader!.id, companyId: company!.id } }))).status, 403)
  // Caller-supplied sessionToken must never override the authenticated cookie.
  assert.equal((await handler(req('/api/users', { method: 'POST', cookie: employee.cookie, csrf: employee.csrf, body: { username: 'escalated', displayName: 'Escalated', password, sessionToken: admin.cookie.split('=')[1]! } }))).status, 403)
  assert.equal((await handler(req('/api/users', { method: 'PATCH', cookie: admin.cookie, csrf: admin.csrf, body: { status: 'disabled' } }))).status, 404)
  const disabled = await handler(req(`/api/users/${created.id}/status`, { method: 'PATCH', cookie: admin.cookie, csrf: admin.csrf, body: { status: 'disabled' } }))
  assert.equal(disabled.status, 200)
  assert.equal((await handler(req('/api/auth/session', { cookie: employee.cookie }))).status, 401)
}))


test('admin password recovery endpoints require permission and revoke the old user session', async () => withHandler(async handler => {
  const admin = await signedIn(handler)
  const created = await readJson(await handler(req('/api/users', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { username: 'clerk', displayName: 'Clerk', password } })))
  const clerkLogin = await handler(req('/api/auth/login', { method: 'POST', body: { organizationSlug: 'acme', username: 'clerk', password } }))
  const clerk = { cookie: clerkLogin.headers.get('set-cookie')!.split(';')[0]!, csrf: (await readJson(clerkLogin)).csrfToken }
  const denied = await handler(req(`/api/users/${created.id}/reset-password`, { method: 'POST', cookie: clerk.cookie, csrf: clerk.csrf, body: { newPassword: 'newly reset password 2026' } }))
  assert.equal(denied.status, 403)
  const reset = await handler(req(`/api/users/${created.id}/reset-password`, { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { newPassword: 'newly reset password 2026' } }))
  assert.equal(reset.status, 200)
  assert.equal((await handler(req('/api/auth/session', { cookie: clerk.cookie }))).status, 401)
  const current = await handler(req('/api/auth/login', { method: 'POST', body: { organizationSlug: 'acme', username: 'clerk', password: 'newly reset password 2026' } }))
  assert.equal(current.status, 200)
}))

test('HTTP validation rejects malformed record inputs and preserves significant password whitespace', async () => withHandler(async handler => {
  const admin = await signedIn(handler)
  const invalidRole = await handler(req('/api/roles', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { scope: 'administrator', code: 'reader', name: 'Reader', permissions: [] } }))
  assert.equal(invalidRole.status, 400)
  const invalidCompany = await handler(req('/api/companies', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { code: 123, name: 'Example' } }))
  assert.equal(invalidCompany.status, 400)
  const exactPassword = '  significant whitespace in password  '
  const user = await handler(req('/api/users', { method: 'POST', cookie: admin.cookie, csrf: admin.csrf, body: { username: 'spaceuser', displayName: 'Space User', password: exactPassword } }))
  assert.equal(user.status, 201)
  const success = await handler(req('/api/auth/login', { method: 'POST', body: { organizationSlug: 'acme', username: 'spaceuser', password: exactPassword } }))
  assert.equal(success.status, 200)
  const wrong = await handler(req('/api/auth/login', { method: 'POST', body: { organizationSlug: 'acme', username: 'spaceuser', password: exactPassword.trim() } }))
  assert.equal(wrong.status, 401)
}))
