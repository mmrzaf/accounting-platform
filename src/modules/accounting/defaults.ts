import type { AccountingContext } from './context.ts'
import { rowAs } from '../../platform/database/rows.ts'
import { invalid, missing } from './errors.ts'
import { uuid } from './validation.ts'
import type { ScopedAction } from './types.ts'

export interface PostingDefaults {
  receivablesId: string
  payablesId: string
  revenueId: string
  expenseId: string
  cashId: string
}
interface DefaultsRow {
  receivables_id: string
  payables_id: string
  revenue_id: string
  expense_id: string
  cash_id: string
}
const fields: readonly { key: keyof PostingDefaults; category: string }[] = [
  { key: 'receivablesId', category: 'asset' },
  { key: 'payablesId', category: 'liability' },
  { key: 'revenueId', category: 'revenue' },
  { key: 'expenseId', category: 'expense' },
  { key: 'cashId', category: 'asset' },
]
function present(row: DefaultsRow): PostingDefaults {
  return { receivablesId: row.receivables_id, payablesId: row.payables_id,
    revenueId: row.revenue_id, expenseId: row.expense_id, cashId: row.cash_id }
}
export function createPostingDefaultsService(ctx: AccountingContext) {
  const { db, actorFor, bookFor, transaction, audit } = ctx
  function getPostingDefaults(input: ScopedAction): PostingDefaults | null {
    const actor = actorFor(input, 'accounting.read')
    bookFor(actor, input.companyId)
    const row = rowAs<DefaultsRow>(db.prepare(`SELECT receivables_id,payables_id,revenue_id,expense_id,cash_id
      FROM posting_defaults WHERE company_id=?`).get(actor.companyId))
    return row ? present(row) : null
  }
  function configurePostingDefaults(input: ScopedAction & PostingDefaults): PostingDefaults {
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.configure')
      bookFor(actor, input.companyId)
      for (const field of fields) {
        const id = uuid(input[field.key], field.key)
        const account = rowAs<{ category: string; active: number; postable: number }>(db.prepare(`SELECT category,active,postable
          FROM ledger_accounts WHERE company_id=? AND id=?`).get(actor.companyId, id))
        if (!account) return missing()
        if (account.category !== field.category || !account.active || !account.postable) return invalid(`${field.key} must reference an active, postable ${field.category} account`)
      }
      if (input.receivablesId === input.cashId) return invalid('Receivables and bank/cash accounts must differ')
      db.prepare(`INSERT INTO posting_defaults(company_id,receivables_id,payables_id,revenue_id,expense_id,cash_id)
        VALUES (?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET
        receivables_id=excluded.receivables_id,payables_id=excluded.payables_id,
        revenue_id=excluded.revenue_id,expense_id=excluded.expense_id,cash_id=excluded.cash_id`).run(
        actor.companyId, input.receivablesId, input.payablesId, input.revenueId, input.expenseId, input.cashId)
      audit(actor, input.companyId, 'accounting.posting-defaults.configure', 'posting_defaults', actor.companyId)
      return { receivablesId: input.receivablesId, payablesId: input.payablesId,
        revenueId: input.revenueId, expenseId: input.expenseId, cashId: input.cashId }
    })
  }
  return Object.freeze({ getPostingDefaults, configurePostingDefaults })
}
