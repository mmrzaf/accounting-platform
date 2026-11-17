import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { DatabaseSync } from 'node:sqlite'
import { IdentityError } from '../../src/modules/identity/errors.ts'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { recoverCompanyAdministrator } from '../../src/modules/identity/operator-recovery.ts'

const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const pwd = 'original secure bootstrap passphrase'

type IdentityService = ReturnType<typeof createIdentityService>
type BootstrapResult = Awaited<ReturnType<IdentityService['bootstrapCompany']>>
type LoginResult = Awaited<ReturnType<IdentityService['login']>>
async function fixture<T>(fn: (svc: IdentityService, db: DatabaseSync, bootstrap: BootstrapResult, session: LoginResult) => T | Promise<T>): Promise<T> {
  const db = openDatabase(':memory:')
  applyMigrations(db, migrations)
  const svc = createIdentityService(db)
  const b = await svc.bootstrapCompany({ name: 'Alpha org', adminUsername: 'admin', adminDisplayName: 'Administrator', password: pwd })
  const session = await svc.login({ username: 'admin', password: pwd })
  try { return await fn(svc, db, b, session) } finally { db.close() }
}

test('administrator password reset revokes user sessions and unlocks account', async () => fixture(async (svc, db, _b, session) => {
  const staff = await svc.createUser({ sessionToken: session.token, username: 'staff', displayName: 'Employee', password: pwd })
  const login = await svc.login({ username: 'staff', password: pwd })
  for (let i = 0; i < 5; i++) await assert.rejects(svc.login({ username: 'staff', password: 'wrong' }))
  await assert.rejects(svc.login({ username: 'staff', password: pwd }))
  assert.deepEqual(svc.unlockUser({ sessionToken: session.token, userId: staff.id }), { ok: true })
  const another = await svc.login({ username: 'staff', password: pwd })
  const reset = await svc.resetUserPassword({ sessionToken: session.token, userId: staff.id, newPassword: 'recovered password with adequate length' })
  assert.deepEqual(reset, { ok: true, sessionsRevoked: true })
  assert.throws(() => svc.me(login.token), err => err instanceof IdentityError && err.code === 'NOT_AUTHENTICATED')
  assert.throws(() => svc.me(another.token), err => err instanceof IdentityError && err.code === 'NOT_AUTHENTICATED')
  await assert.rejects(svc.login({ username: 'staff', password: pwd }))
  const after = await svc.login({ username: 'staff', password: 'recovered password with adequate length' })
  assert.ok(svc.me(after.token).user)
  assert.equal(svc.readAudit({ sessionToken: session.token }).some(e => e.action === 'user.password_reset'), true)
  assert.equal(checkDatabase(db).ok, true)
}))

test('local operator can recover only a company admin; event audited', async () => fixture(async (svc, db, _b, session) => {
  await svc.createUser({ sessionToken: session.token, username: 'staff', displayName: 'Employee', password: pwd })
  await assert.rejects(recoverCompanyAdministrator(db, { username: 'staff', newPassword: 'long recovery password' }), err => err instanceof IdentityError && err.code === 'NOT_FOUND')
  await recoverCompanyAdministrator(db, { username: 'admin', newPassword: 'admin recovery password 2026' })
  assert.throws(() => svc.me(session.token), err => err instanceof IdentityError && err.code === 'NOT_AUTHENTICATED')
  const newSession = await svc.login({ username: 'admin', password: 'admin recovery password 2026' })
  assert.equal(svc.me(newSession.token).user.username, 'admin')
  assert.equal(svc.readAudit({ sessionToken: newSession.token }).some(e => e.action === 'operator.admin_recovery'), true)
}))

test('SQLite prevents moving users and roles across companies', async () => fixture(async (svc, db, a, session) => {
  const b = await svc.bootstrapCompany({ name: 'Bravo org', adminUsername: 'bravo-admin', adminDisplayName: 'Administrator', password: pwd })
  assert.throws(() => db.prepare('UPDATE users SET company_id=? WHERE id=?').run(b.company.id, a.administrator.id), /User company cannot change/u)
  assert.equal(svc.renameCompany({sessionToken:session.token,name:'Changed company name'}).name,'Changed company name')
  const role = svc.listRoles({ sessionToken: session.token }).find(r => r.code === 'company-reader')
  assert.throws(() => db.prepare('UPDATE roles SET company_id=? WHERE id=?').run(b.company.id, role!.id), /Cannot move role to another company/u)
  assert.equal(checkDatabase(db).ok, true)
}))

test('CLI admin recovery replaces the password via stdin without printing the secret', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'acct-recovery-cli-'))
  const cli = fileURLToPath(new URL('../../scripts/app.ts', import.meta.url))
  const run = (args: string[], input?: string) => spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args, '--json'], { cwd, input, encoding: 'utf8', env: { ...process.env, APP_DB_PATH: 'data/db.sqlite' } })
  try {
    assert.equal(run(['db:migrate']).status, 0)
    assert.equal(run(['company:bootstrap', '--name', 'Test', '--admin-username', 'admin', '--admin-name', 'Admin', '--password-stdin'], `${pwd}\n`).status, 0)
    const newPassword = 'new password from local operator stdin'
    const reset = run(['admin:recover', '--admin-username', 'admin', '--password-stdin'], `${newPassword}\n`)
    assert.equal(reset.status, 0, reset.stderr)
    assert.ok(!reset.stdout.includes(newPassword) && !reset.stderr.includes(newPassword))
    const db = openDatabase(join(cwd, 'data/db.sqlite'))
    try {
      const current = await createIdentityService(db).login({ username: 'admin', password: newPassword })
      assert.ok(current.token)
    } finally { db.close() }
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
