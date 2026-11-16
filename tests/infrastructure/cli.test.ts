import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const cli = fileURLToPath(new URL('../../scripts/app.ts', import.meta.url))

function run(cwd: string, ...args: string[]) {
  const child = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args, '--json'], { cwd, encoding: 'utf8', env: { ...process.env, APP_DB_PATH: 'data/test.sqlite', APP_BACKUP_DIR: 'backups' } })
  const response = child.status === 0 ? JSON.parse(child.stdout.trim()) : JSON.parse(child.stderr.trim().split('\n').at(-1)!)
  return { ...child, response }
}

test('CLI setup/migrate/status/check/backup/verify/restore through JSON interface', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'acct-cli-'))
  try {
    assert.equal(run(cwd, 'setup').status, 0)
    assert.equal(run(cwd, 'setup').status, 0)
    assert.equal(run(cwd, 'doctor').response.checks.databaseExists, false)
    const created = run(cwd, 'db:migrate')
    assert.equal(created.status, 0, created.stderr)
    assert.deepEqual(created.response.migrations.applied, ['0001_installation.sql', '0002_identity_access.sql'])
    assert.deepEqual(run(cwd, 'db:migrate').response.migrations.applied, [])
    assert.equal(run(cwd, 'doctor').response.checks.databaseExists, true)
    assert.equal(run(cwd, 'db:status').response.applied, 2)
    assert.equal(run(cwd, 'db:check').response.ok, true)
    const snapshot = run(cwd, 'backup:create')
    assert.equal(snapshot.status, 0, snapshot.stderr)
    assert.equal(snapshot.response.scope, 'sqlite-only')
    assert.equal(run(cwd, 'backup:verify', '--source', snapshot.response.path).response.ok, true)
    const dest = join(cwd, 'restore.sqlite')
    assert.equal(run(cwd, 'backup:restore', '--source', snapshot.response.path, '--target', dest).status, 0)
    assert.notEqual(run(cwd, 'backup:restore', '--source', snapshot.response.path, '--target', dest).status, 0)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('CLI rejects unknown flags, missing arguments and missing backup', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'acct-cli-errors-'))
  try {
    for (const args of [['doctor', '--secret', 'x'], ['backup:verify'], ['backup:restore', '--source', 'something'], ['db:status']]) {
      const result = run(cwd, ...args)
      assert.notEqual(result.status, 0)
      assert.equal(result.response.ok, false)
    }
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
