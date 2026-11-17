import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, invalid, missing } from './errors.ts'
import { key, text, uuid } from './validation.ts'
import type { AccountingContext, AccountRow } from './context.ts'
import type { AccountCategory, AccountInput, ScopedAction } from './types.ts'
const categories = new Set<AccountCategory>(['asset', 'liability', 'equity', 'revenue', 'expense'])
export function createChartService(ctx: AccountingContext) {
  const { db, transaction, actorFor, bookFor, audit } = ctx
  function createAccount(input: AccountInput) {
    const accountCode = key(input.code, 'Account code'), name = text(input.name, 'Account name')
    if (!categories.has(input.category))
      return invalid('Invalid account category')
    const parentId = input.parentId ?? null
    if (parentId !== null)
      uuid(parentId, 'parentId')
    if (input.postable !== undefined && typeof input.postable !== 'boolean')
      return invalid('postable must be boolean')
    const postable = input.postable ?? true
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.configure')
      bookFor(actor, input.companyId)
      if (db.prepare('SELECT 1 FROM ledger_accounts WHERE company_id=? AND code=?').get(actor.companyId, accountCode))
        return conflict('Account code already exists')
      if (parentId !== null) {
        const parent = rowAs<AccountRow>(db.prepare('SELECT id,category,postable,active FROM ledger_accounts WHERE company_id=? AND id=?').get(actor.companyId, parentId))
        if (!parent)
          return missing()
        if (parent.postable || !parent.active || parent.category !== input.category)
          return invalid('Parent account must be an active non-postable account of the same category')
      }
      const id = randomUUID()
      db.prepare('INSERT INTO ledger_accounts(id,company_id,code,name,category,parent_id,postable) VALUES(?,?,?,?,?,?,?)').run(id, input.companyId, accountCode, name, input.category, parentId, postable ? 1 : 0)
      audit(actor, input.companyId, 'accounting.account.create', 'ledger_account', id, { code: accountCode, category: input.category })
      return { id, code: accountCode, name, category: input.category, parentId, postable, active: true }
    })
  }
  function setAccountActive(input: ScopedAction & {
    accountId: string
    active: boolean
  }) {
    uuid(input.accountId, 'accountId')
    if (typeof input.active !== 'boolean')
      return invalid('active must be boolean')
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.configure')
      bookFor(actor, input.companyId)
      const account = rowAs<{
        id: string
        active: number
      }>(db.prepare('SELECT id,active FROM ledger_accounts WHERE id=? AND company_id=?').get(input.accountId, actor.companyId))
      if (!account)
        return missing()
      if (Boolean(account.active) === input.active)
        return { id: input.accountId, active: input.active, changed: false }
      if (!input.active && db.prepare('SELECT 1 FROM ledger_accounts WHERE parent_id=? AND company_id=? AND active=1').get(input.accountId, actor.companyId))
        return conflict('Cannot disable a parent with active children')
      db.prepare('UPDATE ledger_accounts SET active=? WHERE id=? AND company_id=?').run(input.active ? 1 : 0, input.accountId, actor.companyId)
      audit(actor, input.companyId, 'accounting.account.status', 'ledger_account', input.accountId, { active: input.active })
      return { id: input.accountId, active: input.active, changed: true }
    })
  }
  function listAccounts(input: ScopedAction) {
    const actor = actorFor(input, 'accounting.read')
    bookFor(actor, input.companyId)
    return rowsAs<AccountRow>(db.prepare('SELECT id,code,name,category,parent_id,postable,active FROM ledger_accounts WHERE company_id=? ORDER BY code').all(actor.companyId)).map(row => ({ id: row.id, code: row.code, name: row.name, category: row.category, parentId: row.parent_id, postable: !!row.postable, active: !!row.active }))
  }
  return Object.freeze({ createAccount, setAccountActive, listAccounts })
}
