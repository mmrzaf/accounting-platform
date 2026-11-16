import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'

const cli = fileURLToPath(new URL('../../scripts/app.ts', import.meta.url))
const args = ['organization:bootstrap', '--slug', 'demo', '--name', 'Demo organization', '--admin-username', 'owner', '--admin-name', 'Owner', '--company-name', 'Demo Trading', '--company-code', 'trading', '--password-stdin', '--json']
function run(cwd: string, command: string[], input?: string) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cli, ...command], { cwd, encoding: 'utf8', input, env: { ...process.env, APP_DB_PATH: 'secure/app.sqlite', APP_BACKUP_DIR: 'secure/backups' } })
}

test('bootstrap CLI reads a secret only from stdin, creates org/admin/company and never echoes password', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acct-identity-cli-'))
  const pwd = 'private password never printed anywhere'
  try {
    assert.equal(run(dir, ['db:migrate', '--json']).status, 0)
    const initial = run(dir, args, `${pwd}\n`)
    assert.equal(initial.status, 0, initial.stderr)
    const payload = JSON.parse(initial.stdout)
    assert.equal(payload.company.code, 'trading')
    assert.equal(payload.administrator.username, 'owner')
    assert.equal(initial.stdout.includes(pwd), false)
    assert.equal(initial.stderr.includes(pwd), false)
    assert.equal(run(dir, args, `${pwd}\n`).status, 1, 'duplicate bootstrap rejected')
    assert.equal(run(dir, ['organization:bootstrap', '--password', pwd, '--json']).status, 1, 'password passed as CLI arg rejected')
    const db = openDatabase(join(dir, 'secure', 'app.sqlite'))
    try {
      const login = await createIdentityService(db).login({ organizationSlug: 'demo', username: 'owner', password: pwd })
      assert.equal(login.user.username, 'owner')
    } finally { db.close() }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('bootstrap CLI needs migrations and rejects truncated weak passwords', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acct-identity-cli-invalid-'))
  try {
    assert.notEqual(run(dir, args, 'correct horse password').status, 0, 'migration required')
    assert.equal(run(dir, ['db:migrate', '--json']).status, 0)
    assert.notEqual(run(dir, args, 'short\n').status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
