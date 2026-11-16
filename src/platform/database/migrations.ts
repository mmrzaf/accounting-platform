import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { rowAs, rowsAs } from './rows.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_PATTERN = /^\d{4}_[a-z0-9_-]+\.sql$/

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

export function listMigrations(directory: string) {
  const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
  if (files.some(name => !MIGRATION_PATTERN.test(name)) || new Set(files.map(name => name.slice(0, 4))).size !== files.length) {
    throw new MigrationError('Invalid or duplicate migration name')
  }
  return files.map(name => {
    const sql = readFileSync(join(directory, name), 'utf8')
    if (!sql.trim()) throw new MigrationError(`Empty migration: ${name}`)
    const checksum = createHash('sha256').update(sql).digest('hex')
    return { name, sql, checksum }
  })
}

function ensureHistory(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT`)
}

/** Reject drift and unknown applied migrations; never silently rewrite history. */
export function migrationStatus(db: DatabaseSync, directory: string) {
  const expected = listMigrations(directory)
  const exists = rowAs<{ n: number }>(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get())?.n === 1
  const applied = exists ? rowsAs<{ name: string; checksum: string }>(db.prepare('SELECT name, checksum FROM schema_migrations ORDER BY name').all()) : []
  const appliedMap = new Map(applied.map(row => [row.name, row.checksum]))
  const names = new Set(expected.map(item => item.name))
  for (const item of applied) {
    if (!names.has(item.name)) throw new MigrationError(`Unknown applied migration: ${item.name}`)
  }
  let firstPending = false
  for (const item of expected) {
    const previous = appliedMap.get(item.name)
    if (previous !== undefined && previous !== item.checksum) throw new MigrationError(`Migration checksum mismatch: ${item.name}`)
    if (previous === undefined) firstPending = true
    else if (firstPending) throw new MigrationError(`Migration history gap: ${item.name}`)
  }
  return { applied: applied.length, pending: expected.filter(item => !appliedMap.has(item.name)).map(item => item.name), expected }
}

export function applyMigrations(db: DatabaseSync, directory: string) {
  const status = migrationStatus(db, directory)
  if (status.pending.length === 0) return { applied: [], alreadyApplied: status.applied }
  db.exec('BEGIN IMMEDIATE')
  try {
    ensureHistory(db)
    const insert = db.prepare('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)')
    const pending = new Set(status.pending)
    for (const item of status.expected) {
      if (!pending.has(item.name)) continue
      db.exec(item.sql)
      insert.run(item.name, item.checksum)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { applied: status.pending, alreadyApplied: status.applied }
}
