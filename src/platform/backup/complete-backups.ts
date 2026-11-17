import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { openDatabase, checkDatabase } from '../database/sqlite.ts'
import { rowsAs } from '../database/rows.ts'
import { BackupError } from './backups.ts'

interface BlobRow {
  id: string
  organization_id: string
  company_id: string
  byte_length: number
  sha256: string
}
interface BlobManifest {
  relativePath: string
  byteLength: number
  sha256: string
}
interface CompleteManifest {
  format: 2
  scope: 'database-and-attachments'
  createdAt: string
  database: { sha256: string }
  blobs: BlobManifest[]
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const SHA = /^[a-f0-9]{64}$/u
const DATABASE = 'database.sqlite'
const MANIFEST = 'manifest.json'

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function regularFile(path: string, label: string) {
  const entry = await lstat(path)
  if (!entry.isFile() || entry.isSymbolicLink()) throw new BackupError(`${label} must be a regular file`)
  return entry
}
async function originalBlobFile(root: string, relativePath: string) {
  const base = resolve(root)
  const segments = relativePath.split('/')
  // Check each directory component: a symlinked organization/company folder must not
  // make an attachment reference escape the operator-configured blob root.
  const baseMeta = await lstat(base)
  if (!baseMeta.isDirectory() || baseMeta.isSymbolicLink()) throw new BackupError('Attachment root must be a real directory')
  let current = base
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment)
    const dir = await lstat(current)
    if (!dir.isDirectory() || dir.isSymbolicLink()) throw new BackupError('Attachment storage path contains a symlink')
  }
  const path = join(current, segments.at(-1)!)
  return { path, metadata: await regularFile(path, 'Attachment') }
}
function blobName(row: Pick<BlobRow, 'organization_id' | 'company_id' | 'id'>): string {
  if (![row.organization_id, row.company_id, row.id].every(value => UUID.test(value))) throw new BackupError('Unsafe attachment identifier')
  return `${row.organization_id}/${row.company_id}/${row.id}.blob`
}
function blobRows(db: ReturnType<typeof openDatabase>): BlobRow[] {
  return rowsAs<BlobRow>(db.prepare(`SELECT id, organization_id, company_id, byte_length, sha256
    FROM document_attachments ORDER BY organization_id,company_id,id`).all())
}
function validateManifest(value: unknown): CompleteManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BackupError('Invalid complete backup manifest')
  const m = value as Partial<CompleteManifest>
  if (m.format !== 2 || m.scope !== 'database-and-attachments' || typeof m.createdAt !== 'string' ||
      typeof m.database?.sha256 !== 'string' || !SHA.test(m.database.sha256) || !Array.isArray(m.blobs))
    throw new BackupError('Invalid complete backup manifest')
  let previous = ''
  for (const blob of m.blobs) {
    if (!blob || typeof blob.relativePath !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.blob$/u.test(blob.relativePath) ||
        !Number.isSafeInteger(blob.byteLength) || blob.byteLength < 1 || typeof blob.sha256 !== 'string' || !SHA.test(blob.sha256))
      throw new BackupError('Invalid attachment manifest entry')
    const [org, company, file] = blob.relativePath.split('/')
    if (!org || !company || !file || !UUID.test(org) || !UUID.test(company) || !UUID.test(file.slice(0, -5)))
      throw new BackupError('Unsafe attachment path in manifest')
    if (previous && previous >= blob.relativePath) throw new BackupError('Backup attachment list must be unique and sorted')
    previous = blob.relativePath
  }
  return m as CompleteManifest
}

/** Immutable attachment blobs and committed metadata allow a consistent snapshot:
 * 1. SQLite online backup establishes the committed metadata set.
 * 2. Only blobs referenced by that snapshot are copied and verified.
 * No destructive blob updates are supported by the document service.
 */
export async function createCompleteBackup(databasePath: string, attachmentRoot: string, backupParent: string) {
  const parent = resolve(backupParent)
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const name = `accounting-${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}.bundle`
  const destination = join(parent, name)
  const temporary = join(parent, `.${name}.partial`)
  await mkdir(temporary, { mode: 0o700 })
  try {
    const source = openDatabase(resolve(databasePath), { create: false })
    try {
      if (!checkDatabase(source).ok) throw new BackupError('Source database integrity check failed')
      await sqliteBackup(source, join(temporary, DATABASE))
    } finally { source.close() }
    const snapshot = openDatabase(join(temporary, DATABASE), { create: false })
    let records: BlobRow[]
    try {
      if (!checkDatabase(snapshot).ok) throw new BackupError('Snapshot database integrity check failed')
      records = blobRows(snapshot)
    } finally { snapshot.close() }
    // The online snapshot inherits WAL mode. Normalize the *offline copy* to DELETE mode
    // so a verified bundle never depends on transient -shm/-wal sidecar files.
    const normalized = new DatabaseSync(join(temporary, DATABASE))
    try { normalized.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE') }
    finally { normalized.close() }
    await rm(join(temporary, `${DATABASE}-wal`), { force: true })
    await rm(join(temporary, `${DATABASE}-shm`), { force: true })
    const blobs: BlobManifest[] = []
    for (const row of records) {
      const relativePath = blobName(row)
      if (!SHA.test(row.sha256) || !Number.isSafeInteger(row.byte_length) || row.byte_length < 1)
        throw new BackupError('Invalid attachment metadata in database')
      const { path: sourcePath, metadata: sourceStat } = await originalBlobFile(attachmentRoot, relativePath)
      const targetPath = join(temporary, 'blobs', relativePath)
      if (sourceStat.size !== row.byte_length || await sha256(sourcePath) !== row.sha256)
        throw new BackupError('Attachment bytes do not match database metadata')
      await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 })
      await copyFile(sourcePath, targetPath, 1 /* COPYFILE_EXCL */)
      await chmod(targetPath, 0o600)
      const copiedStat = await regularFile(targetPath, 'Copied attachment')
      if (copiedStat.size !== row.byte_length || await sha256(targetPath) !== row.sha256)
        throw new BackupError('Attachment changed while backup was created')
      blobs.push({ relativePath, byteLength: row.byte_length, sha256: row.sha256 })
    }
    blobs.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'))
    const manifest: CompleteManifest = {
      format: 2,
      scope: 'database-and-attachments',
      createdAt: new Date().toISOString(),
      database: { sha256: await sha256(join(temporary, DATABASE)) },
      blobs,
    }
    await writeFile(join(temporary, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await verifyCompleteBackup(temporary)
    await rename(temporary, destination)
    return { path: destination, scope: manifest.scope, attachmentCount: blobs.length, databaseSha256: manifest.database.sha256 }
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

/** Verify every database-referenced attachment and every manifest-declared byte. */
export async function verifyCompleteBackup(bundleDirectory: string) {
  const root = resolve(bundleDirectory)
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new BackupError('Backup must be a directory')
  const manifest = validateManifest(JSON.parse(await readFile(join(root, MANIFEST), 'utf8')) as unknown)
  await regularFile(join(root, DATABASE), 'Backup database')
  if (await sha256(join(root, DATABASE)) !== manifest.database.sha256) throw new BackupError('Backup database checksum mismatch')
  const db = openDatabase(join(root, DATABASE), { create: false })
  let rows: BlobRow[]
  try {
    if (!checkDatabase(db).ok) throw new BackupError('Backup database integrity check failed')
    rows = blobRows(db)
  } finally { db.close() }
  const expected = rows.map(row => ({ relativePath: blobName(row), byteLength: row.byte_length, sha256: row.sha256 }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'))
  if (JSON.stringify(expected) !== JSON.stringify(manifest.blobs)) throw new BackupError('Attachment manifest differs from database metadata')
  for (const blob of manifest.blobs) {
    const fullPath = join(root, 'blobs', blob.relativePath)
    const metadata = await regularFile(fullPath, 'Backup attachment')
    if (metadata.size !== blob.byteLength || await sha256(fullPath) !== blob.sha256) throw new BackupError('Backup attachment checksum mismatch')
  }
  // Reject unrelated files inside the immutable archive so the archive has one unambiguous content set.
  const expectedFiles = new Set([DATABASE, MANIFEST, ...manifest.blobs.map(b => `blobs/${b.relativePath}`)])
  async function walk(directory: string, relative: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const subpath = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw new BackupError('Backup contains a symbolic link')
      if (entry.isDirectory()) await walk(path, subpath)
      else if (!entry.isFile() || !expectedFiles.has(subpath)) throw new BackupError(`Backup contains an unexpected file: ${subpath}`)
    }
  }
  await walk(root, '')
  return { ok: true as const, scope: manifest.scope, attachmentCount: manifest.blobs.length, databaseSha256: manifest.database.sha256 }
}

/** Restore only into two new, empty destinations. Existing destinations are never replaced. */
export async function restoreCompleteBackup(bundleDirectory: string, destinationDb: string, destinationAttachments: string) {
  const source = resolve(bundleDirectory), dbPath = resolve(destinationDb), blobRoot = resolve(destinationAttachments)
  if (dbPath === blobRoot || dbPath.startsWith(`${blobRoot}/`) || blobRoot.startsWith(`${dbPath}/`) ||
      dbPath.startsWith(`${source}/`) || blobRoot.startsWith(`${source}/`))
    throw new BackupError('Restore targets must not overlap the source archive or each other')
  await verifyCompleteBackup(source)
  const manifest = validateManifest(JSON.parse(await readFile(join(source, MANIFEST), 'utf8')) as unknown)
  await mkdir(dirname(dbPath), { recursive: true, mode: 0o700 })
  await mkdir(dirname(blobRoot), { recursive: true, mode: 0o700 })
  // Refuse either existing destination *before* creating anything.
  for (const dest of [dbPath, blobRoot]) {
    try { await lstat(dest); throw new BackupError('Restore target already exists') }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error }
  }
  let createdDb = false, createdRoot = false
  try {
    await mkdir(blobRoot, { mode: 0o700 })
    createdRoot = true
    await copyFile(join(source, DATABASE), dbPath, 1 /* COPYFILE_EXCL */)
    createdDb = true
    await chmod(dbPath, 0o600)
    for (const blob of manifest.blobs) {
      const dest = join(blobRoot, blob.relativePath)
      await mkdir(dirname(dest), { recursive: true, mode: 0o700 })
      await copyFile(join(source, 'blobs', blob.relativePath), dest, 1 /* COPYFILE_EXCL */)
      await chmod(dest, 0o600)
    }
    const db = openDatabase(dbPath, { create: false })
    try { if (!checkDatabase(db).ok) throw new BackupError('Restored database integrity check failed') }
    finally { db.close() }
    return { restoredDatabase: dbPath, restoredAttachments: blobRoot, attachmentCount: manifest.blobs.length }
  } catch (error) {
    if (createdDb) await rm(dbPath, { force: true })
    if (createdRoot) await rm(blobRoot, { recursive: true, force: true })
    throw error
  }
}
