import { backup as sqliteBackup } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, copyFile, chmod } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { openDatabase, checkDatabase } from '../database/sqlite.ts'

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

async function digest(path: string) {
  const hash = createHash('sha256')
  const data = await readFile(path)
  hash.update(data)
  return hash.digest('hex')
}

export async function createBackup(databasePath: string, backupDir: string) {
  await mkdir(backupDir, { recursive: true, mode: 0o700 })
  const name = `accounting-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.sqlite`
  const target = join(backupDir, name)
  const temp = `${target}.partial`
  const manifest = `${target}.manifest.json`
  const db = openDatabase(databasePath, { create: false })
  try {
    const before = checkDatabase(db)
    if (!before.ok) throw new BackupError('Source database failed integrity check')
    await sqliteBackup(db, temp)
    const snapshot = openDatabase(temp, { create: false })
    try {
      if (!checkDatabase(snapshot).ok) throw new BackupError('Backup failed integrity check')
    } finally { snapshot.close() }
    // The verification connection may create WAL/SHM sidecars for the temporary file.
    // The online backup itself is complete; no sidecar belongs in the artifact.
    await rm(`${temp}-wal`, { force: true })
    await rm(`${temp}-shm`, { force: true })
    await chmod(temp, 0o600)
    const sha256 = await digest(temp)
    await rename(temp, target)
    await writeFile(manifest, `${JSON.stringify({ format: 1, filename: name, sha256, createdAt: new Date().toISOString(), scope: 'sqlite-only' }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    return { path: target, manifest, sha256, scope: 'sqlite-only' }
  } catch (error) {
    await rm(temp, { force: true })
    await rm(`${temp}-wal`, { force: true })
    await rm(`${temp}-shm`, { force: true })
    await rm(target, { force: true })
    await rm(manifest, { force: true })
    throw error
  } finally { db.close() }
}

interface BackupManifest { format: number; filename: string; sha256: string; createdAt: string; scope: 'sqlite-only' }
function isBackupManifest(value: unknown): value is BackupManifest {
  return typeof value === 'object' && value !== null && 'format' in value && 'filename' in value && 'sha256' in value && 'createdAt' in value && 'scope' in value &&
    typeof value.format === 'number' && typeof value.filename === 'string' && typeof value.sha256 === 'string' && typeof value.createdAt === 'string' && value.scope === 'sqlite-only'
}

export async function verifyBackup(file: string) {
  const backupFile = resolve(file)
  const manifest: unknown = JSON.parse(await readFile(`${backupFile}.manifest.json`, 'utf8'))
  if (!isBackupManifest(manifest)) throw new BackupError('Malformed backup manifest')
  if (manifest.format !== 1 || manifest.filename !== basename(backupFile) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new BackupError('Malformed backup manifest')
  }
  const actual = await digest(backupFile)
  if (actual !== manifest.sha256) throw new BackupError('Backup checksum mismatch')
  const db = openDatabase(backupFile, { create: false })
  try {
    const integrity = checkDatabase(db)
    if (!integrity.ok) throw new BackupError('Backup database integrity check failed')
    return { ok: true, sha256: actual, integrity }
  } finally { db.close() }
}

/** Safe restore into a NEW path only. Never overwrite a live database. */
export async function restoreBackup(source: string, target: string) {
  const from = resolve(source)
  const to = resolve(target)
  if (from === to) throw new BackupError('Source and target are identical')
  await verifyBackup(from)
  await mkdir(dirname(to), { recursive: true, mode: 0o700 })
  try {
    // COPYFILE_EXCL refuses any existing target, including symlink destinations.
    const { constants } = await import('node:fs')
    await copyFile(from, to, constants.COPYFILE_EXCL)
    await chmod(to, 0o600)
    const copied = openDatabase(to, { create: false })
    try {
      if (!checkDatabase(copied).ok) throw new BackupError('Restored database failed integrity check')
    } finally { copied.close() }
    return { restoredTo: to }
  } catch (error) {
    // Do not remove a preexisting destination on EEXIST.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') throw new BackupError('Restore destination already exists; refusing to overwrite')
    await rm(to, { force: true })
    throw error
  }
}
