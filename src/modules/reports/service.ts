import type { DatabaseSync } from 'node:sqlite'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { createIdentityContext } from '../identity/context.ts'
import { createAccountingService } from '../accounting/service.ts'
import { dateOnly } from '../accounting/validation.ts'
import { invalid } from '../trading/errors.ts'
import type { CompanyAction } from '../trading/types.ts'
interface AgeInvoice { id: string; kind: 'sale' | 'purchase'; party_id: string; display_name: string; issued_on: string; number: string; total_minor: string }
interface Amount { amount_minor: string }
interface ProfitRow { category: 'revenue' | 'expense'; debit_minor: bigint; credit_minor: bigint }
const dayMs = 86_400_000
/** Current receivables/payables by invoice age, NOT overdue aging (invoices have no due-date field yet). */
export function createBusinessReports(db: DatabaseSync, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  const identity = createIdentityContext(db, clock)
  const accounting = createAccountingService(db, { clock })
  function invoiceAging(input: CompanyAction & { kind: 'sale' | 'purchase' }) {
    if (input.kind !== 'sale' && input.kind !== 'purchase') return invalid('Invalid invoice kind')
    const actor = identity.requireActor(input.sessionToken, input.kind === 'sale' ? 'sales.read' : 'purchasing.read', input.companyId)
    const today = clock().toISOString().slice(0, 10)
    const invoices = rowsAs<AgeInvoice>(db.prepare(`SELECT i.id,i.kind,i.party_id,c.display_name,i.issued_on,i.number,
       CAST(i.total_minor AS TEXT) AS total_minor
       FROM trade_invoices i JOIN contacts c ON c.company_id=i.company_id AND c.id=i.party_id
       WHERE i.company_id=? AND i.kind=? AND i.status='posted' AND i.issued_on<=?
       ORDER BY i.issued_on,i.id LIMIT 5001`).all(actor.companyId, input.kind, today))
    if (invoices.length > 5000) return invalid('Aging report exceeds the 5000-invoice safety limit')
    const sum = db.prepare(`SELECT bigint_total(a.amount_minor) AS amount_minor FROM payment_allocations a
      JOIN trade_payments p ON p.id=a.payment_id WHERE a.invoice_id=? AND p.paid_on<=?
      AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)`)
    const credits = db.prepare(`SELECT bigint_total(amount_minor) AS amount_minor FROM trade_credit_notes
      WHERE invoice_id=? AND status='posted' AND credited_on<=?`)
    const buckets = { current: 0n, days31to60: 0n, days61to90: 0n, over90: 0n }
    const rows: { invoiceId: string; number: string; partyId: string; partyName: string; invoiceDate: string; ageDays: number; outstandingMinor: string }[] = []
    let total = 0n
    for (const invoice of invoices) {
      const allocated = BigInt(rowAs<Amount>(sum.get(invoice.id, today))?.amount_minor ?? '0')
      const credited = BigInt(rowAs<Amount>(credits.get(invoice.id, today))?.amount_minor ?? '0')
      const outstanding = BigInt(invoice.total_minor) - allocated - credited
      if (outstanding < 0n) throw new Error('Invariant violation: invoice credits and allocations exceed face value')
      if (outstanding === 0n) continue
      const age = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${invoice.issued_on}T00:00:00Z`)) / dayMs))
      if (age <= 30) buckets.current += outstanding
      else if (age <= 60) buckets.days31to60 += outstanding
      else if (age <= 90) buckets.days61to90 += outstanding
      else buckets.over90 += outstanding
      total += outstanding
      rows.push({ invoiceId: invoice.id, number: invoice.number, partyId: invoice.party_id,
        partyName: invoice.display_name, invoiceDate: invoice.issued_on, ageDays: age, outstandingMinor: outstanding.toString() })
    }
    return { companyId: input.companyId, kind: input.kind, asOf: today, basis: 'invoice-age' as const,
      buckets: { currentMinor: buckets.current.toString(), days31to60Minor: buckets.days31to60.toString(),
        days61to90Minor: buckets.days61to90.toString(), over90Minor: buckets.over90.toString() },
      totalOutstandingMinor: total.toString(), rows, truncated: false }
  }
  function profitAndLoss(input: CompanyAction & { from: string; through: string }) {
    const from = dateOnly(input.from), through = dateOnly(input.through)
    if (from > through) return invalid('Report from must be before or equal to through')
    const actor = identity.requireActor(input.sessionToken, 'accounting.read', input.companyId)
    const book = accounting.getBook(input)
    const stmt = db.prepare(`SELECT a.category,l.debit_minor,l.credit_minor FROM journal_lines l
      JOIN journal_entries j ON j.id=l.journal_id AND j.company_id=l.company_id
      JOIN ledger_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
      WHERE l.company_id=? AND j.status='posted' AND j.posted_on>=? AND j.posted_on<=?
      AND a.category IN ('revenue','expense')`)
    stmt.setReadBigInts(true)
    let revenues = 0n, expenses = 0n
    for (const raw of stmt.iterate(actor.companyId, from, through)) {
      const row = rowAs<ProfitRow>(raw)!
      if (row.category === 'revenue') revenues += row.credit_minor - row.debit_minor
      else expenses += row.debit_minor - row.credit_minor
    }
    return { companyId: input.companyId, from, through, baseCurrency: book.base_currency,
      revenueMinor: revenues.toString(), expenseMinor: expenses.toString(), netProfitMinor: (revenues - expenses).toString() }
  }
  function balanceSheet(input: CompanyAction & { through?: string }) {
    const summary = accounting.financialSummary(input)
    return { ...summary, totalLiabilitiesEquityAndIncomeMinor:
      (BigInt(summary.liabilitiesMinor) + BigInt(summary.equityMinor) + BigInt(summary.netIncomeMinor)).toString() }
  }
  return Object.freeze({ invoiceAging, profitAndLoss, balanceSheet })
}
