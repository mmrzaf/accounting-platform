import { DatabaseSync } from 'node:sqlite'
import { rowAs } from './rows.ts'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDatabase(path: string, { create = true }: { create?: boolean } = {}): DatabaseSync {
  if (path !== ':memory:' && create) mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path, { timeout: 5000, readOnly: !create })
  try {
    db.exec('PRAGMA foreign_keys=ON')
    db.exec('PRAGMA busy_timeout=5000')
    if (create && path !== ':memory:') {
      db.exec('PRAGMA journal_mode=WAL')
      // The enclosing directory should also be private; restrict file access on POSIX.
      chmodSync(path, 0o600)
    }
    if (rowAs<{ foreign_keys: number }>(db.prepare('PRAGMA foreign_keys').get())?.foreign_keys !== 1) throw new Error('SQLite foreign keys are disabled')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function checkDatabase(db: DatabaseSync) {
  const integrity = db.prepare('PRAGMA integrity_check').all().map(row => row['integrity_check'])
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all()
  const version = rowAs<{ version: string }>(db.prepare('select sqlite_version() as version').get())?.version ?? 'unknown'
  return { ok: integrity.length === 1 && integrity[0] === 'ok' && foreignKeys.length === 0, integrity, foreignKeyViolations: foreignKeys.length, sqliteVersion: version }
}
