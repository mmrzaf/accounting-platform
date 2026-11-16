import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { invalid, missing } from './errors.ts'
import { dateOnly, uuid } from './validation.ts'
import type { AccountingContext, AccountRow } from './context.ts'
import type { LedgerQuery, ScopedAction, TrialBalanceQuery } from './types.ts'
interface AmountRow {
  account_id: string
  debit_minor: bigint
  credit_minor: bigint
}
interface LedgerRow extends AmountRow {
  id: string
  journal_id: string
  posted_on: string
  source_type: string
  source_id: string
  line_no: bigint
  description: string
}
/** Materialize reports only from posted journal lines, never from mutable document balances. */
export function createReportingService(ctx: AccountingContext) {
  const { db, actorFor, bookFor } = ctx
  function trialBalance(input: TrialBalanceQuery) {
    const actor = actorFor(input, 'accounting.read')
    const book = bookFor(actor, input.companyId)
    const through = input.through === undefined ? null : dateOnly(input.through)
    const accounts = rowsAs<AccountRow>(db.prepare(`SELECT id,code,name,category,postable,active,parent_id FROM ledger_accounts
   WHERE organization_id=? AND company_id=? ORDER BY code`).all(actor.organizationId, input.companyId))
    const sums = new Map<string, {
      debit: bigint
      credit: bigint
    }>()
    const stmt = db.prepare(`SELECT l.account_id,l.debit_minor,l.credit_minor FROM journal_lines l
   JOIN journal_entries j ON j.id=l.journal_id AND j.organization_id=l.organization_id AND j.company_id=l.company_id
   WHERE l.organization_id=? AND l.company_id=? AND j.status='posted' AND (? IS NULL OR j.posted_on<=?)`)
    stmt.setReadBigInts(true)
    for (const raw of stmt.iterate(actor.organizationId, input.companyId, through, through)) {
      const row = rowAs<AmountRow>(raw)!
      const sum = sums.get(row.account_id) ?? { debit: 0n, credit: 0n }
      sum.debit += row.debit_minor
      sum.credit += row.credit_minor
      sums.set(row.account_id, sum)
    }
    let totalDebit = 0n, totalCredit = 0n
    const rows = accounts.map(account => {
      const sumsForAccount = sums.get(account.id) ?? { debit: 0n, credit: 0n }
      const net = sumsForAccount.debit - sumsForAccount.credit
      const balanceDebit = net > 0n ? net : 0n
      const balanceCredit = net < 0n ? -net : 0n
      totalDebit += balanceDebit
      totalCredit += balanceCredit
      return { accountId: account.id, code: account.code, name: account.name, category: account.category,
        // Gross movements are preserved for drilldown; conventional trial-balance totals use NET balances.
        debitMinor: sumsForAccount.debit.toString(), creditMinor: sumsForAccount.credit.toString(),
        balanceDebitMinor: balanceDebit.toString(), balanceCreditMinor: balanceCredit.toString(),
        netDebitMinor: net.toString() }
    })
    if (totalDebit !== totalCredit)
      throw new Error('Ledger invariant violated: trial balance is not balanced')
    return { companyId: input.companyId, baseCurrency: book.base_currency, through, rows, totalDebitMinor: totalDebit.toString(), totalCreditMinor: totalCredit.toString() }
  }
  function generalLedger(input: LedgerQuery) {
    const actor = actorFor(input, 'accounting.read')
    const book = bookFor(actor, input.companyId)
    const accountId = uuid(input.accountId, 'accountId')
    const from = input.from === undefined ? null : dateOnly(input.from)
    const through = input.through === undefined ? null : dateOnly(input.through)
    if (from !== null && through !== null && from > through)
      return invalid('From date must not follow through date')
    const limit = input.limit ?? 100, offset = input.offset ?? 0
    if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0 || offset > 1000000)
      return invalid('Invalid ledger pagination')
    const account = rowAs<AccountRow>(db.prepare('SELECT id,code,name,category,postable,active,parent_id FROM ledger_accounts WHERE id=? AND organization_id=? AND company_id=?').get(accountId, actor.organizationId, input.companyId))
    if (!account)
      return missing()
    const stmt = db.prepare(`SELECT l.id,l.journal_id,l.account_id,l.line_no,l.debit_minor,l.credit_minor,j.posted_on,j.source_type,j.source_id,j.description
   FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_id AND j.organization_id=l.organization_id AND j.company_id=l.company_id
   WHERE l.organization_id=? AND l.company_id=? AND l.account_id=? AND j.status='posted'
   AND (? IS NULL OR j.posted_on<=?) ORDER BY j.posted_on,j.entry_number,l.line_no`)
    stmt.setReadBigInts(true)
    let balance = 0n, opening = 0n, matching = 0
    const rows: {
      journalId: string
      lineId: string
      date: string
      sourceType: string
      sourceId: string
      description: string
      debitMinor: string
      creditMinor: string
      balanceMinor: string
    }[] = []
    for (const raw of stmt.iterate(actor.organizationId, input.companyId, accountId, through, through)) {
      const line = rowAs<LedgerRow>(raw)!
      if (from !== null && line.posted_on < from) {
        opening += line.debit_minor - line.credit_minor
        balance = opening
        continue
      }
      balance += line.debit_minor - line.credit_minor
      if (matching >= offset && rows.length < limit)
        rows.push({ journalId: line.journal_id, lineId: line.id, date: line.posted_on,
          sourceType: line.source_type, sourceId: line.source_id, description: line.description,
          debitMinor: line.debit_minor.toString(), creditMinor: line.credit_minor.toString(), balanceMinor: balance.toString() })
      matching++
    }
    return { companyId: input.companyId, accountId, accountCode: account.code, baseCurrency: book.base_currency,
      from, through, openingNetDebitMinor: opening.toString(), closingNetDebitMinor: balance.toString(), totalRows: matching, offset, limit, rows }
  }
  /** Reconciled cumulative category totals. Formal fiscal-year closing remains future work. */
  function financialSummary(input: ScopedAction & {
    through?: string
  }) {
    const balance = trialBalance(input)
    const totals = { assets: 0n, liabilities: 0n, equity: 0n, revenue: 0n, expenses: 0n }
    for (const row of balance.rows) {
      const signed = BigInt(row.netDebitMinor)
      switch (row.category) {
        case 'asset':
          totals.assets += signed
          break
        case 'liability':
          totals.liabilities -= signed
          break
        case 'equity':
          totals.equity -= signed
          break
        case 'revenue':
          totals.revenue -= signed
          break
        case 'expense':
          totals.expenses += signed
          break
      }
    }
    const netIncome = totals.revenue - totals.expenses
    if (totals.assets !== totals.liabilities + totals.equity + netIncome)
      throw new Error('Financial summary does not reconcile to trial balance')
    return { companyId: input.companyId, baseCurrency: balance.baseCurrency, through: balance.through,
      assetsMinor: totals.assets.toString(), liabilitiesMinor: totals.liabilities.toString(), equityMinor: totals.equity.toString(),
      revenueMinor: totals.revenue.toString(), expensesMinor: totals.expenses.toString(), netIncomeMinor: netIncome.toString() }
  }
  return Object.freeze({ trialBalance, generalLedger, financialSummary })
}
