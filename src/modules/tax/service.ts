import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { createIdentityContext, transaction } from '../identity/context.ts'
import { dateOnly, key, text } from '../accounting/validation.ts'
import { roundRatio, minorUnits } from '../accounting/money.ts'
import { invalid, conflict, missing } from '../trading/errors.ts'
import type { CompanyAction } from '../trading/types.ts'

interface TaxRow { id: string; code: string; name: string; effective_on: string; rate_ppm: number }
const presentation = (row: TaxRow) => ({ id: row.id, code: row.code, name: row.name, effectiveOn: row.effective_on, ratePpm: row.rate_ppm })
/** Append-only dated schedule. This does not apply taxes to invoices automatically. */
export function createTaxService(db: DatabaseSync, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  const identity = createIdentityContext(db, clock)
  function configure(input: CompanyAction & { code: string; name: string; effectiveOn: string; ratePpm: number }) {
    const code = key(input.code, 'tax code'), name = text(input.name, 'Tax name', 160), effectiveOn = dateOnly(input.effectiveOn)
    const rate = input.ratePpm
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) return invalid('Rate must be integer parts per million from 0 through 1000000')
    return transaction(db, () => {
      const actor = identity.requireActor(input.sessionToken, 'tax.manage', input.companyId)
      const existing = rowAs<TaxRow>(db.prepare(`SELECT id,code,name,effective_on,rate_ppm FROM tax_code_versions WHERE organization_id=? AND company_id=? AND code=? AND effective_on=?`)
        .get(actor.organizationId, input.companyId, code, effectiveOn))
      if (existing) {
        if (existing.name !== name || existing.rate_ppm !== rate) return conflict('Tax-code date already configured differently')
        return { ...presentation(existing), replayed: true }
      }
      const id = randomUUID()
      db.prepare(`INSERT INTO tax_code_versions(id,organization_id,company_id,code,name,effective_on,rate_ppm,created_by) VALUES(?,?,?,?,?,?,?,?)`)
        .run(id, actor.organizationId, input.companyId, code, name, effectiveOn, rate, actor.userId)
      identity.audit({ organizationId: actor.organizationId, companyId: input.companyId, actorId: actor.userId,
        action: 'tax.configure', subjectType: 'tax_code_version', subjectId: id, details: { code, effectiveOn, ratePpm: rate } })
      return { id, code, name, effectiveOn, ratePpm: rate, replayed: false }
    })
  }
  function list(input: CompanyAction & { code?: string }) {
    const actor = identity.requireActor(input.sessionToken, 'tax.read', input.companyId)
    const code = input.code === undefined ? null : key(input.code, 'tax code')
    return rowsAs<TaxRow>(db.prepare(`SELECT id,code,name,effective_on,rate_ppm FROM tax_code_versions
      WHERE organization_id=? AND company_id=? AND (? IS NULL OR code=?) ORDER BY code,effective_on DESC`)
      .all(actor.organizationId, input.companyId, code, code)).map(presentation)
  }
  function atDate(input: CompanyAction & { code: string; on: string }) {
    const actor = identity.requireActor(input.sessionToken, 'tax.read', input.companyId)
    const code = key(input.code, 'tax code'), on = dateOnly(input.on)
    const row = rowAs<TaxRow>(db.prepare(`SELECT id,code,name,effective_on,rate_ppm FROM tax_code_versions
      WHERE organization_id=? AND company_id=? AND code=? AND effective_on<=? ORDER BY effective_on DESC LIMIT 1`)
      .get(actor.organizationId, input.companyId, code, on))
    return row ? presentation(row) : missing()
  }
  function quote(input: CompanyAction & { code: string; on: string; amountMinor: string }) {
    const taxCode = atDate(input)
    const base = minorUnits(input.amountMinor, 'Tax basis')
    const tax = roundRatio(base * BigInt(taxCode.ratePpm), 1_000_000n)
    return { ...taxCode, amountMinor: base.toString(), calculatedTaxMinor: tax.toString() }
  }
  return Object.freeze({ configure, list, atDate, quote })
}
