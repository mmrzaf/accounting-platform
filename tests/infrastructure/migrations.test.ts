import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations, migrationStatus, MigrationError } from '../../src/platform/database/migrations.ts'

const migrationDir = fileURLToPath(new URL('../../migrations/', import.meta.url))

function withFixture<T>(run: (db: DatabaseSync, root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'acct-migrate-'))
  const db = openDatabase(join(root, 'db.sqlite'))
  try { return run(db, root) } finally { db.close(); rmSync(root, { recursive: true, force: true }) }
}

test('migrations apply atomically and are idempotent', () => withFixture(db => {
  assert.deepEqual(migrationStatus(db, migrationDir).pending, ['0001_installation.sql', '0002_identity_access.sql', '0003_accounting_ledger.sql'])
  assert.deepEqual(applyMigrations(db, migrationDir).applied, ['0001_installation.sql', '0002_identity_access.sql', '0003_accounting_ledger.sql'])
  assert.deepEqual(applyMigrations(db, migrationDir).applied, [])
  assert.equal(migrationStatus(db, migrationDir).applied, 3)
  assert.equal(checkDatabase(db).ok, true)
}))

test('migration checksum drift is rejected', () => withFixture(db => {
  applyMigrations(db, migrationDir)
  const history = String(db.prepare('SELECT name FROM schema_migrations').get()!['name'])
  db.prepare('UPDATE schema_migrations SET checksum=? WHERE name=?').run('f'.repeat(64), history)
  assert.throws(() => migrationStatus(db, migrationDir), MigrationError)
}))

test('future migrations after an unknown applied version are rejected', () => withFixture(db => {
  applyMigrations(db, migrationDir)
  db.prepare('INSERT INTO schema_migrations(name, checksum) VALUES (?, ?)').run('0002_unknown.sql', 'a'.repeat(64))
  assert.throws(() => migrationStatus(db, migrationDir), MigrationError)
}))

test('failed migration rolls back schema and records', () => withFixture((db, root) => {
  const m = join(root, 'migrations')
  mkdirSync(m)
  writeFileSync(join(m, '0001_base.sql'), 'CREATE TABLE fixture (id INTEGER PRIMARY KEY);')
  applyMigrations(db, m)
  writeFileSync(join(m, '0002_fails.sql'), 'CREATE TABLE temporary_table (id INTEGER); INSERT INTO nonexistent VALUES (1);')
  assert.throws(() => applyMigrations(db, m))
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='temporary_table'").get()!['n'], 0)
  assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()!['n'], 1)
}))
