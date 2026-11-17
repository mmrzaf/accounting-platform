import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { createIdentityContext, transaction } from '../identity/context.ts'
import { text, uuid } from '../accounting/validation.ts'
import { invalid, missing } from '../trading/errors.ts'
import type { CompanyAction } from '../trading/types.ts'

type Subject = 'invoice' | 'payment' | 'contact' | 'journal'
interface RecordRow { id: string; subject_type: Subject; subject_id: string; filename: string; media_type: string; byte_length: number; sha256: string; created_at: string }
const allowedMedia = new Set(['application/pdf','image/png','image/jpeg','text/plain'])
const present = (row: RecordRow) => ({ id: row.id, subjectType: row.subject_type, subjectId: row.subject_id,
  filename: row.filename, mediaType: row.media_type, byteLength: row.byte_length, sha256: row.sha256, createdAt: row.created_at })
/** Files are server-owned: caller never supplies a storage path; no untrusted filename is used as a path. */
export function createDocumentService(db: DatabaseSync, blobRoot: string, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  if (typeof blobRoot !== 'string' || !blobRoot.trim()) throw new TypeError('Provide a protected attachment root')
  const root = resolve(blobRoot)
  const identity = createIdentityContext(db, clock)
  function subjectExists(organizationId: string, companyId: string, type: Subject, id: string) {
    const table = { invoice: 'trade_invoices', payment: 'trade_payments', contact: 'contacts', journal: 'journal_entries' }[type]
    const params = type === 'contact' ? [organizationId, id] : [organizationId, companyId, id]
    return Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE organization_id=? ${type === 'contact' ? '' : 'AND company_id=?'} AND id=?`).get(...params))
  }
  function subject(type: unknown, id: unknown): { type: Subject; id: string } {
    if (type !== 'invoice' && type !== 'payment' && type !== 'contact' && type !== 'journal') return invalid('Invalid attachment subject')
    return { type, id: uuid(id, 'subjectId') }
  }
  function blobPath(orgId: string, companyId: string, id: string) { return join(root, uuid(orgId), uuid(companyId), `${uuid(id)}.blob`) }
  function metadata(input: CompanyAction & { attachmentId: string }) {
    const actor = identity.requireActor(input.sessionToken, 'documents.read', input.companyId)
    const record = rowAs<RecordRow>(db.prepare(`SELECT id,subject_type,subject_id,filename,media_type,byte_length,sha256,created_at
      FROM document_attachments WHERE organization_id=? AND company_id=? AND id=?`)
      .get(actor.organizationId, input.companyId, uuid(input.attachmentId, 'attachmentId')))
    return { actor, record: record ?? missing() }
  }
  function attach(input: CompanyAction & { subjectType: Subject; subjectId: string; filename: string; mediaType: string; data: Uint8Array }) {
    const { type, id: subjectId } = subject(input.subjectType, input.subjectId)
    const filename = text(input.filename, 'Filename', 160)
    if (/[\\/<>]/u.test(filename) || filename === '.' || filename === '..') return invalid('Filename must be a display name, not a path')
    if (typeof input.mediaType !== 'string' || !allowedMedia.has(input.mediaType)) return invalid('Unsupported media type')
    if (!(input.data instanceof Uint8Array) || input.data.byteLength === 0 || input.data.byteLength > 10 * 1024 * 1024)
      return invalid('Attachment must be 1 byte to 10 MiB')
    const data = Buffer.from(input.data), sha256 = createHash('sha256').update(data).digest('hex')
    const actor = identity.requireActor(input.sessionToken, 'documents.manage', input.companyId)
    if (!subjectExists(actor.organizationId, input.companyId, type, subjectId)) return missing()
    const id = randomUUID(), path = blobPath(actor.organizationId, input.companyId, id)
    let written = false
    try {
      return transaction(db, () => {
        // The database row becomes visible only after the blob has been written.
        identity.requireActor(input.sessionToken, 'documents.manage', input.companyId)
        if (!subjectExists(actor.organizationId, input.companyId, type, subjectId)) return missing()
        mkdirSync(join(root, actor.organizationId, input.companyId), { recursive: true, mode: 0o700 })
        writeFileSync(path, data, { flag: 'wx', mode: 0o600, flush: true })
        written = true
        db.prepare(`INSERT INTO document_attachments(id,organization_id,company_id,subject_type,subject_id,filename,media_type,byte_length,sha256,created_by)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, actor.organizationId, input.companyId, type, subjectId, filename, input.mediaType, data.byteLength, sha256, actor.userId)
        identity.audit({ organizationId: actor.organizationId, companyId: input.companyId, actorId: actor.userId,
          action: 'documents.attach', subjectType: 'attachment', subjectId: id, details: { fileBytes: data.byteLength, subjectType: type } })
        return { id, subjectType: type, subjectId, filename, mediaType: input.mediaType, byteLength: data.byteLength, sha256 }
      })
    } catch (error) {
      // Also cover failures during COMMIT, not only during INSERT.
      if (written && existsSync(path)) unlinkSync(path)
      throw error
    }
  }
  function list(input: CompanyAction & { subjectType: Subject; subjectId: string }) {
    const { type, id } = subject(input.subjectType, input.subjectId)
    const actor = identity.requireActor(input.sessionToken, 'documents.read', input.companyId)
    if (!subjectExists(actor.organizationId, input.companyId, type, id)) return missing()
    return rowsAs<RecordRow>(db.prepare(`SELECT id,subject_type,subject_id,filename,media_type,byte_length,sha256,created_at
      FROM document_attachments WHERE organization_id=? AND company_id=? AND subject_type=? AND subject_id=? ORDER BY created_at,id LIMIT 1000`)
      .all(actor.organizationId, input.companyId, type, id)).map(present)
  }
  function read(input: CompanyAction & { attachmentId: string }) {
    const { actor, record } = metadata(input)
    const path = blobPath(actor.organizationId, input.companyId, record.id)
    if (!existsSync(path)) throw new Error('Attachment blob missing; restore database and files together')
    if (statSync(path).size !== record.byte_length) throw new Error('Attachment size mismatch')
    const data = readFileSync(path)
    if (createHash('sha256').update(data).digest('hex') !== record.sha256) throw new Error('Attachment checksum mismatch')
    return { ...present(record), data }
  }
  return Object.freeze({ attach, list, read })
}
