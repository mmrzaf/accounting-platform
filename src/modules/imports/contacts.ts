import type { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { rowAs } from '../../platform/database/rows.ts'
import { createIdentityContext, transaction } from '../identity/context.ts'
import { createTradingService } from '../trading/service.ts'
import { invalid, conflict } from '../trading/errors.ts'
import { key } from '../accounting/validation.ts'
import type { CompanyAction } from '../trading/types.ts'

/** CSV parser for strictly controlled contacts import: UTF-8 text, RFC4180 quoting and CRLF. */
export function parseContactCsv(csv: string): { displayName: string; code: string | null }[] {
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > 1_048_576) return invalid('CSV must be UTF-8 text at most 1 MiB')
  const input = csv.replace(/^\uFEFF/u, '')
  const rows: string[][] = []
  let fields: string[] = [], field = '', quoted = false, afterQuote = false, atStart = true
  function flushField() { fields.push(field); field = ''; atStart = true; afterQuote = false }
  function flushRow() {
    flushField()
    if (fields.some(value => value !== '')) rows.push(fields)
    fields = []
    if (rows.length > 502) return invalid('CSV has too many rows')
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ } else { quoted = false; afterQuote = true }
      } else field += char
    } else if (afterQuote) {
      if (char === ',') flushField()
      else if (char === '\r' || char === '\n') { if (char === '\r' && input[i + 1] === '\n') i++; flushRow() }
      else return invalid('Unexpected content after a quoted CSV field')
    } else if (char === ',' ) flushField()
    else if (char === '\r' || char === '\n') { if (char === '\r' && input[i + 1] === '\n') i++; flushRow() }
    else if (char === '"' && atStart) { quoted = true; atStart = false }
    else if (char === '"') return invalid('Unexpected quote in CSV field')
    else { field += char; atStart = false }
  }
  if (quoted) return invalid('Unterminated CSV quoted field')
  if (fields.length || field !== '' || afterQuote) flushRow()
  const header = rows.shift()
  if (!header || header.length !== 2 || header[0] !== 'displayName' || header[1] !== 'code')
    return invalid('CSV header must be: displayName,code')
  if (rows.length === 0) return invalid('CSV has no contacts')
  if (rows.length > 500) return invalid('Import limit: 500 contacts')
  return rows.map((row, i) => {
    if (row.length !== 2) return invalid(`CSV row ${i + 2} must have two columns`)
    const [displayName, code] = row
    if (!displayName) return invalid(`CSV row ${i + 2} has no display name`)
    return { displayName, code: code || null }
  })
}
class PreviewComplete extends Error {
  readonly rows: { id: string; code: string | null; displayName: string; replayed: boolean }[]
  constructor(rows: { id: string; code: string | null; displayName: string; replayed: boolean }[]) { super('Dry run'); this.rows = rows }
}
/** Dry-run rolls back the *same* validation and SQL path as commit, including audit records. */
export function createContactImportService(db: DatabaseSync, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  const identity = createIdentityContext(db, clock)
  const trading = createTradingService(db, { clock })
  function importContacts(input: CompanyAction & { csv: string; batchKey: string; dryRun?: boolean }) {
    const records = parseContactCsv(input.csv)
    const fingerprint = createHash('sha256').update(JSON.stringify(records)).digest('hex')
    const batchKey = key(input.batchKey, 'batchKey')
    if (batchKey.length > 110) return invalid('Batch key must be at most 110 characters')
    if (input.dryRun !== undefined && typeof input.dryRun !== 'boolean') return invalid('dryRun must be a boolean')
    const actor = identity.requireActor(input.sessionToken, 'contacts.manage', input.companyId)
    const prefix = `import.${createHash('sha256').update(`${actor.organizationId}:${input.companyId}:${batchKey}`).digest('hex').slice(0,24)}`
    try {
      return transaction(db, () => {
        const prior = rowAs<{ fingerprint: string; row_count: number }>(db.prepare(`SELECT fingerprint,row_count FROM contact_import_batches
          WHERE organization_id=? AND company_id=? AND batch_key=?`).get(actor.organizationId, input.companyId, batchKey))
        if (prior && (prior.fingerprint !== fingerprint || prior.row_count !== records.length)) return conflict('Import batch key reused with different contacts')
        const results = records.map((row, i) => {
          const result = trading.createContact({ ...input, displayName: row.displayName, code: row.code, requestKey: `${prefix}.${i + 1}` })
          return { id: result.id, code: result.code, displayName: result.displayName, replayed: result.replayed }
        })
        if (input.dryRun) throw new PreviewComplete(results)
        if (!prior) db.prepare(`INSERT INTO contact_import_batches(id,organization_id,company_id,batch_key,fingerprint,row_count)
          VALUES(?,?,?,?,?,?)`).run(randomUUID(), actor.organizationId, input.companyId, batchKey, fingerprint, records.length)
        return { dryRun: false as const, created: results.filter(row => !row.replayed).length,
          replayed: results.filter(row => row.replayed).length, rows: results }
      })
    } catch (error) {
      if (error instanceof PreviewComplete) return { dryRun: true as const, created: error.rows.filter(row => !row.replayed).length,
        replayed: error.rows.filter(row => row.replayed).length, rows: error.rows.map(row => ({ ...row, id: null })) }
      throw error
    }
  }
  return Object.freeze({ importContacts })
}
