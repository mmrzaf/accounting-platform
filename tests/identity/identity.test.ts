import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { DatabaseSync } from 'node:sqlite'
import { IdentityError } from '../../src/modules/identity/errors.ts'
import assert from 'node:assert/strict'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { verifyPassword } from '../../src/modules/identity/passwords.ts'
import { PERMISSIONS } from '../../src/modules/identity/permissions.ts'

const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const pwd = 'correct horse stable battery 2026'

async function fixture<T>(fn: (svc: ReturnType<typeof createIdentityService>, db: DatabaseSync) => T | Promise<T>, options: { clock?: () => Date } = {}): Promise<T> {
  const db = openDatabase(':memory:')
  applyMigrations(db, migrations)
  const svc = createIdentityService(db, options)
  try { return await fn(svc, db) } finally { db.close() }
}
async function boot(svc: ReturnType<typeof createIdentityService>, slug = 'alpha') {
  const result = await svc.bootstrapOrganization({ slug, name: `Organization ${slug}`, adminUsername: 'admin', adminDisplayName: 'Admin', password: pwd })
  const session = await svc.login({ organizationSlug: slug, username: 'admin', password: pwd })
  return { ...result, token: session.token, csrfToken: session.csrfToken }
}
function rejectsCode(operation: Promise<unknown>, code: string) {
  return assert.rejects(operation, err => err instanceof IdentityError && err.code === code)
}
function throwsCode(operation: () => unknown, code: string) {
  return assert.throws(operation, err => err instanceof IdentityError && err.code === code)
}

test('bootstrap is atomic, passwords hashed, user session random and not persisted in plaintext', async () => fixture(async (svc, db) => {
  const a = await boot(svc)
  assert.equal(a.organization.slug, 'alpha')
  assert.equal(svc.me(a.token).user.username, 'admin')
  assert.equal(svc.listCompanies({ sessionToken: a.token }).length, 1)
  const stored = db.prepare('SELECT password_hash FROM users WHERE id=?').get(a.administrator.id)!['password_hash'] as string
  assert.match(stored, /^scrypt\$v1\$/u)
  assert.notEqual(stored, pwd)
  assert.equal(await verifyPassword(pwd, stored), true)
  assert.equal(await verifyPassword('wrong password', stored), false)
  assert.equal(String(db.prepare('SELECT token_hash FROM sessions').get()!['token_hash']).length, 64)
  assert.equal(db.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(a.token), undefined)
  await rejectsCode(svc.bootstrapOrganization({ slug: 'alpha', name: 'Duplicate', adminUsername: 'admin', adminDisplayName: 'Admin', password: pwd }), 'CONFLICT')
  assert.equal(db.prepare('SELECT count(*) AS n FROM organizations').get()!['n'], 1)
  assert.equal(checkDatabase(db).ok, true)
}))

test('company role grants never cross company, role scope or organization; no default user access', async () => fixture(async (svc, db) => {
  const a = await boot(svc)
  const b = await boot(svc, 'bravo')
  const secondCompany = svc.createCompany({ sessionToken: a.token, code: 'second', name: 'Second legal company' })
  const staff = await svc.createUser({ sessionToken: a.token, username: 'staff', displayName: 'Staff member', password: pwd })
  const staffSession = await svc.login({ organizationSlug: 'alpha', username: 'staff', password: pwd })
  assert.deepEqual(svc.listCompanies({ sessionToken: staffSession.token }), [])
  assert.equal(svc.hasPermission({ sessionToken: staffSession.token, permission: 'company.read', companyId: a.company.id }), false)
  assert.equal(svc.hasPermission({ sessionToken: staffSession.token, permission: 'company.read', companyId: b.company.id }), false)
  throwsCode(() => svc.listUsers({ sessionToken: staffSession.token }), 'PERMISSION_DENIED')
  const roles = svc.listRoles({ sessionToken: a.token })
  const reader = roles.find(role => role.code === 'company-reader')
  const admin = roles.find(role => role.code === 'organization-admin')
  const assignment = svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: reader!.id, companyId: a.company.id })
  assert.equal(assignment.created, true)
  assert.equal(svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: reader!.id, companyId: a.company.id }).created, false)
  assert.deepEqual(svc.listCompanies({ sessionToken: staffSession.token }).map(x => x.code), ['main'])
  assert.equal(svc.hasPermission({ sessionToken: staffSession.token, permission: 'company.read', companyId: a.company.id }), true)
  assert.equal(svc.hasPermission({ sessionToken: staffSession.token, permission: 'accounting.post', companyId: a.company.id }), false)
  assert.equal(svc.hasPermission({ sessionToken: staffSession.token, permission: 'company.read', companyId: secondCompany.id }), false)
  assert.equal(svc.hasPermission({ sessionToken: staffSession.token, permission: 'company.read', companyId: b.company.id }), false)
  throwsCode(() => svc.assignRole({ sessionToken: a.token, userId: b.administrator.id, roleId: reader!.id, companyId: a.company.id }), 'NOT_FOUND')
  throwsCode(() => svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: reader!.id, companyId: b.company.id }), 'NOT_FOUND')
  throwsCode(() => svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: admin!.id, companyId: a.company.id }), 'VALIDATION_FAILED')
  throwsCode(() => svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: reader!.id }), 'VALIDATION_FAILED')
  throwsCode(() => svc.createRole({ sessionToken: a.token, scope: 'organization', code: 'bad-role', name: 'Bad role', permissions: ['accounting.post'] }), 'VALIDATION_FAILED')
  // Defense in depth: storage rejects linking an Alpha user to a Bravo company.
  assert.throws(() => db.prepare('INSERT INTO user_role_assignments(id, organization_id, user_id, role_id, scope, company_id) VALUES (?,?,?,?,?,?)')
    .run('forced-assignment', a.organization.id, staff.id, reader!.id, 'company', b.company.id), /FOREIGN KEY constraint failed/u)
  svc.revokeRole({ sessionToken: a.token, assignmentId: assignment.id })
  assert.deepEqual(svc.listCompanies({ sessionToken: staffSession.token }), [])
}))

test('custom roles are scoped and permission registration is enforced by SQLite', async () => fixture(async (svc, db) => {
  const a = await boot(svc)
  const custom = svc.createRole({ sessionToken: a.token, scope: 'company', code: 'sales-lite', name: 'Sales only', permissions: ['company.read', 'sales.read'] })
  assert.equal(custom.permissions.length, 2)
  const staff = await svc.createUser({ sessionToken: a.token, username: 'seller', displayName: 'Seller', password: pwd })
  svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: custom.id, companyId: a.company.id })
  const login = await svc.login({ organizationSlug: 'alpha', username: 'seller', password: pwd })
  assert.equal(svc.hasPermission({ sessionToken: login.token, permission: 'sales.read', companyId: a.company.id }), true)
  assert.equal(svc.hasPermission({ sessionToken: login.token, permission: 'payments.manage', companyId: a.company.id }), false)
  assert.throws(() => db.prepare('INSERT INTO role_permissions(organization_id,role_id,scope,permission_code) VALUES(?,?,?,?)')
    .run(a.organization.id, custom.id, 'company', 'organizations.read'), /FOREIGN KEY constraint failed/u)
}))

test('disable invalidates sessions, last admin protected and roles are checked live', async () => fixture(async (svc, db) => {
  const a = await boot(svc)
  throwsCode(() => svc.setUserStatus({ sessionToken: a.token, userId: a.administrator.id, status: 'disabled' }), 'CONFLICT')
  const staff = await svc.createUser({ sessionToken: a.token, username: 'worker', displayName: 'Worker', password: pwd })
  const staffLogin = await svc.login({ organizationSlug: 'alpha', username: 'worker', password: pwd })
  const adminRole = svc.listRoles({ sessionToken: a.token }).find(r => r.code === 'organization-admin')
  const assigned = svc.assignRole({ sessionToken: a.token, userId: staff.id, roleId: adminRole!.id })
  assert.equal(svc.hasPermission({ sessionToken: staffLogin.token, permission: 'users.manage' }), true)
  // Staff is an additional administrator; revoking its grant immediately removes access.
  svc.revokeRole({ sessionToken: a.token, assignmentId: assigned.id })
  assert.equal(svc.hasPermission({ sessionToken: staffLogin.token, permission: 'users.manage' }), false)
  svc.setUserStatus({ sessionToken: a.token, userId: staff.id, status: 'disabled' })
  throwsCode(() => svc.me(staffLogin.token), 'NOT_AUTHENTICATED')
  throwsCode(() => svc.revokeRole({ sessionToken: a.token, assignmentId: svc.listAssignments({ sessionToken: a.token, userId: a.administrator.id }).find(x => x.scope === 'organization')!.id }), 'CONFLICT')
  assert.equal(db.prepare('SELECT revoked_at FROM sessions WHERE user_id=?').get(staff.id)!['revoked_at'] !== null, true)
}))

test('changing password invalidates all sessions; logout revokes one session', async () => fixture(async svc => {
  const a = await boot(svc)
  const second = await svc.login({ organizationSlug: 'alpha', username: 'admin', password: pwd })
  await svc.changePassword({ sessionToken: a.token, oldPassword: pwd, newPassword: 'an entirely new secure password' })
  throwsCode(() => svc.me(a.token), 'NOT_AUTHENTICATED')
  throwsCode(() => svc.me(second.token), 'NOT_AUTHENTICATED')
  await rejectsCode(svc.login({ organizationSlug: 'alpha', username: 'admin', password: pwd }), 'NOT_AUTHENTICATED')
  const current = await svc.login({ organizationSlug: 'alpha', username: 'admin', password: 'an entirely new secure password' })
  svc.logout(current.token)
  throwsCode(() => svc.me(current.token), 'NOT_AUTHENTICATED')
}))

test('login failures throttle, expire, never expose user enumeration in errors', async () => {
  let at = new Date('2026-11-17T00:00:00Z')
  await fixture(async (svc, db) => {
    await boot(svc)
    for (let i = 0; i < 5; i++) await rejectsCode(svc.login({ organizationSlug: 'alpha', username: 'admin', password: 'wrong' }), 'NOT_AUTHENTICATED')
    await rejectsCode(svc.login({ organizationSlug: 'alpha', username: 'admin', password: pwd }), 'NOT_AUTHENTICATED')
    assert.equal(db.prepare('SELECT failures FROM login_throttles').get()!['failures'], 5)
    at = new Date(at.getTime() + 16 * 60 * 1000)
    const login = await svc.login({ organizationSlug: 'alpha', username: 'admin', password: pwd })
    assert.ok(login.token)
    assert.equal(db.prepare('SELECT count(*) AS n FROM login_throttles').get()!['n'], 0)
    await rejectsCode(svc.login({ organizationSlug: 'missing', username: 'admin', password: 'wrong' }), 'NOT_AUTHENTICATED')
    await rejectsCode(svc.login({ organizationSlug: 'alpha', username: 'absent', password: 'wrong' }), 'NOT_AUTHENTICATED')
    assert.equal(svc.readAudit({ sessionToken: login.token }).some(e => e.action === 'session.login' && e.outcome === 'failure'), true)
  }, { clock: () => at })
})

test('concurrent duplicate-user creation has one winner; audit append-only', async () => fixture(async (svc, db) => {
  const a = await boot(svc)
  const attempts = await Promise.allSettled([1,2].map(() => svc.createUser({ sessionToken: a.token, username: 'duplicate', displayName: 'Duplicate', password: pwd })))
  assert.deepEqual(attempts.map(p => p.status).sort(), ['fulfilled', 'rejected'])
  assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE username='duplicate'").get()!['n'], 1)
  assert.throws(() => db.prepare('UPDATE security_audit SET outcome=?').run('failure'), /Audit events are append-only/u)
  assert.throws(() => db.prepare('DELETE FROM security_audit').run(), /Audit events are append-only/u)
  assert.equal(checkDatabase(db).ok, true)
}))


test('permission registry and database stay in sync; sessions expire at the security boundary', async () => {
  let at = new Date('2026-11-17T00:00:00Z')
  await fixture(async (svc, db) => {
    const definitions = db.prepare('SELECT code, scope FROM permission_definitions ORDER BY code').all()
    assert.deepEqual(Object.fromEntries(definitions.map(row => [row['code'], row['scope']])), PERMISSIONS)
    const a = await boot(svc)
    at = new Date(at.getTime() + 13 * 60 * 60 * 1000)
    throwsCode(() => svc.me(a.token), 'NOT_AUTHENTICATED')
    assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(a.administrator.id)!['n'], 1)
  }, { clock: () => at })
})
