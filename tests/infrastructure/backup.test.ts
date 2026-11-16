import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createBackup, verifyBackup, restoreBackup, BackupError } from '../../src/platform/backup/backups.ts'

const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))

test('consistent SQLite backup verifies and restores only to a new path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'acct-backup-'))
  try {
    const path = join(root, 'source.sqlite')
    const db = openDatabase(path)
    applyMigrations(db, migrations)
    db.prepare('INSERT INTO installation_settings(key, value) VALUES (?, ?)').run('test', 'preserved')
    db.close()
    const archive = await createBackup(path, join(root, 'backups'))
    const names = await readdir(join(root, 'backups'))
    assert.equal(names.some(name => name.includes('.partial')), false, 'backup leaves no partial files')
    assert.equal((await verifyBackup(archive.path)).ok, true)
    const destination = join(root, 'restored.sqlite')
    await restoreBackup(archive.path, destination)
    const restored = openDatabase(destination, { create: false })
    try { assert.equal(restored.prepare('SELECT value FROM installation_settings WHERE key=?').get('test')!['value'], 'preserved') }
    finally { restored.close() }
    await assert.rejects(() => restoreBackup(archive.path, destination), BackupError)
    await assert.rejects(() => restoreBackup(archive.path, archive.path), BackupError)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('backup tampering is detected before restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'acct-tamper-'))
  try {
    const path = join(root, 'source.sqlite')
    const db = openDatabase(path)
    applyMigrations(db, migrations)
    db.close()
    const archive = await createBackup(path, join(root, 'backups'))
    const bytes = await readFile(archive.path)
    bytes[120] = bytes[120]! ^ 1
    await writeFile(archive.path, bytes)
    await assert.rejects(() => verifyBackup(archive.path), BackupError)
    await assert.rejects(() => restoreBackup(archive.path, join(root, 'restored.sqlite')), BackupError)
  } finally { await rm(root, { recursive: true, force: true }) }
})
