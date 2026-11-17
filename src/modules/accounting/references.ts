import type { DatabaseSync } from 'node:sqlite'
import type { Actor } from '../identity/types.ts'
import { rowAs } from '../../platform/database/rows.ts'
import { invalid, missing } from './errors.ts'
import { uuid } from './validation.ts'
/** Internal read-only accounting references for authenticated business services. */
export function createAccountingReferenceReader(db: DatabaseSync) {
  function book(actor: Actor, companyId: string) {
    return rowAs<{ base_currency: string; timezone: string; decimals: number }>(db.prepare(`SELECT b.base_currency,b.timezone,c.decimals FROM accounting_books b
      JOIN accounting_currencies c ON c.organization_id=b.organization_id AND c.company_id=b.company_id AND c.code=b.base_currency
      WHERE b.organization_id=? AND b.company_id=?`)
      .get(actor.organizationId, companyId)) ?? missing()
  }
  function account(actor: Actor, companyId: string, accountId: string, category: string) {
    const row = rowAs<{ id: string; category: string; active: number; postable: number }>(db.prepare(`SELECT id,category,active,postable FROM ledger_accounts
      WHERE organization_id=? AND company_id=? AND id=?`).get(actor.organizationId, companyId, uuid(accountId, 'accountId')))
    if (!row) return missing()
    if (!row.active || !row.postable || row.category !== category) return invalid(`Expected an active postable ${category} account`)
    return row
  }
  return Object.freeze({ book, account })
}
