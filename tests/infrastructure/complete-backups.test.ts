import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, symlink, mkdir, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createTradingService } from '../../src/modules/trading/service.ts'
import { createDocumentService } from '../../src/modules/documents/service.ts'
import { createBackup, verifyBackup, restoreBackup } from '../../src/platform/backup/backups.ts'
const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))

test('complete backup captures DB and attachments, verifies, restores, refuses overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acct-full-'))
  try {
    const dbPath = join(dir, 'live.sqlite'), blobs = join(dir, 'attachments')
    const db = openDatabase(dbPath)
    applyMigrations(db, migrations)
    const identity = createIdentityService(db)
    const bootstrap = await identity.bootstrapOrganization({ slug: 'backup', name: 'Backup', adminUsername: 'owner', adminDisplayName: 'Owner', password: 'correct horse battery staple 123456' })
    const login = await identity.login({ organizationSlug: 'backup', username: 'owner', password: 'correct horse battery staple 123456' })
    const scope = { sessionToken: login.token, companyId: bootstrap.company.id }
    const contact = createTradingService(db).createContact({ ...scope, displayName: 'Test contact' })
    const documents = createDocumentService(db, blobs)
    const input = Buffer.from('financial document bytes')
    const attachment = documents.attach({ ...scope, subjectType: 'contact', subjectId: contact.id, filename: 'document.txt', mediaType: 'text/plain', data: input })
    const backup = await createBackup(dbPath, blobs, join(dir, 'backups'))
    assert.equal(backup.attachmentCount, 1)
    assert.equal((await verifyBackup(backup.path)).attachmentCount, 1)
    const restoredDb = join(dir, 'restored.sqlite'), restoredBlobs = join(dir, 'restored-attachments')
    await restoreBackup(backup.path, restoredDb, restoredBlobs)
    const copy = openDatabase(restoredDb, { create: false })
    try {
      assert.equal(checkDatabase(copy).ok, true)
      assert.deepEqual(createDocumentService(copy, restoredBlobs).read({ ...scope, attachmentId: attachment.id }).data, input)
    } finally { copy.close() }
    await assert.rejects(() => restoreBackup(backup.path, restoredDb, join(dir, 'another-attachments')), /already exists/u)
    await assert.rejects(() => restoreBackup(backup.path, join(backup.path, 'bad.sqlite'), join(dir, 'outside-attachments')), /overlap/u)
    await assert.rejects(() => restoreBackup(backup.path, join(dir, 'nested', 'database.sqlite'), join(dir, 'nested')), /overlap/u)
    assert.deepEqual(await readdir(join(dir, 'backups')), [basename(backup.path)])
    db.close()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('backup rejects missing, corrupted, unrelated and symlinked blobs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acct-full-corrupt-'))
  try {
    const database = join(dir, 'src.sqlite'), blobs = join(dir, 'blobs')
    const db = openDatabase(database)
    applyMigrations(db, migrations)
    const identity = createIdentityService(db)
    const boot = await identity.bootstrapOrganization({ slug: 'files', name: 'Files', adminUsername: 'owner', adminDisplayName: 'Owner', password: 'correct horse battery staple 123456' })
    const { token } = await identity.login({ organizationSlug: 'files', username: 'owner', password: 'correct horse battery staple 123456' })
    const scope = { sessionToken: token, companyId: boot.company.id }
    const contact = createTradingService(db).createContact({ ...scope, displayName: 'Ledger' })
    const attachment = createDocumentService(db, blobs).attach({ ...scope, subjectType: 'contact', subjectId: contact.id, filename: 'doc.txt', mediaType: 'text/plain', data: Buffer.from('original') })
    const blob = join(blobs, boot.organization.id, boot.company.id, `${attachment.id}.blob`)
    await writeFile(blob, 'tampered')
    await assert.rejects(() => createBackup(database, blobs, join(dir, 'backups')), /do not match/u)
    await writeFile(blob, 'original')
    const backup = await createBackup(database, blobs, join(dir, 'backups'))
    const savedBlob = join(backup.path, 'blobs', boot.organization.id, boot.company.id, `${attachment.id}.blob`)
    await writeFile(savedBlob, 'damaged!')
    await assert.rejects(() => verifyBackup(backup.path), /checksum mismatch/u)
    await writeFile(savedBlob, 'original')
    await writeFile(join(backup.path, 'unexpected.txt'), 'not allowed')
    await assert.rejects(() => verifyBackup(backup.path), /unexpected file/u)
    await rm(join(backup.path, 'unexpected.txt'))
    await rm(savedBlob)
    await symlink(blob, savedBlob)
    await assert.rejects(() => verifyBackup(backup.path), /regular file/u)
    db.close()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('complete backup of an installation with no attachments remains restorable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acct-full-empty-'))
  try {
    const dbPath = join(dir, 'src.sqlite'), db = openDatabase(dbPath)
    applyMigrations(db, migrations)
    db.close()
    await mkdir(join(dir, 'blobs'))
    const backup = await createBackup(dbPath, join(dir, 'blobs'), join(dir, 'backups'))
    assert.equal((await verifyBackup(backup.path)).attachmentCount, 0)
    await restoreBackup(backup.path, join(dir, 'other.sqlite'), join(dir, 'other-blobs'))
    const manifest = await readFile(join(backup.path, 'manifest.json'), 'utf8')
    assert.equal(JSON.parse(manifest).scope, 'database-and-attachments')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
