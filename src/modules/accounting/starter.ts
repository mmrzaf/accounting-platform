import type { AccountingContext } from './context.ts'
import type { ScopedAction } from './types.ts'
import { conflict, invalid } from './errors.ts'
import { createChartService } from './accounts.ts'
import { createPostingDefaultsService } from './defaults.ts'

const starterAccounts = [
  { code:'1100', category:'asset', en:'Cash', fa:'صندوق' },
  { code:'1200', category:'asset', en:'Bank', fa:'بانک' },
  { code:'1300', category:'asset', en:'Accounts receivable', fa:'حساب‌های دریافتنی' },
  { code:'2100', category:'liability', en:'Accounts payable', fa:'حساب‌های پرداختنی' },
  { code:'3100', category:'equity', en:'Owner equity', fa:'سرمایه' },
  { code:'4100', category:'revenue', en:'Sales revenue', fa:'درآمد فروش' },
  { code:'5100', category:'expense', en:'Purchases and service expenses', fa:'هزینه خرید و خدمات' },
] as const

/** One-time convenience for a genuinely empty book. Not an Iranian statutory
 * chart and not a replacement for accountant-approved account configuration.
 * Existing charts are never modified, merged or guessed at.
 */
export function createStarterChartService(ctx: AccountingContext) {
  const chart = createChartService(ctx)
  const defaults = createPostingDefaultsService(ctx)
  return {
    initializeStarterChart(input: ScopedAction & { locale: 'fa'|'en' }) {
      if (input.locale !== 'fa' && input.locale !== 'en') return invalid('Invalid starter chart language')
      return ctx.transaction(ctx.db, () => {
        const actor=ctx.actorFor(input,'accounting.configure')
        ctx.bookFor(actor,input.companyId)
        if (ctx.db.prepare('SELECT 1 FROM ledger_accounts WHERE company_id=? LIMIT 1').get(actor.companyId) ||
            ctx.db.prepare('SELECT 1 FROM posting_defaults WHERE company_id=? LIMIT 1').get(actor.companyId) ||
            ctx.db.prepare('SELECT 1 FROM journal_entries WHERE company_id=? LIMIT 1').get(actor.companyId))
          return conflict('Starter chart is only available for an empty accounting book')
        const created = starterAccounts.map(def => chart.createAccount({ ...input, code:def.code,
          name:def[input.locale], category:def.category }))
        const id=(code:string)=>created.find(a=>a.code===code)!.id
        const posting = defaults.configurePostingDefaults({ ...input,
          receivablesId:id('1300'),payablesId:id('2100'),revenueId:id('4100'),
          expenseId:id('5100'),cashId:id('1200') })
        ctx.audit(actor,actor.companyId,'accounting.starter-chart.initialize','company',actor.companyId,
          { locale:input.locale, accounts:created.length })
        return { accounts:created, postingDefaults:posting }
      })
    },
  }
}
