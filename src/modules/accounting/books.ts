import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, invalid, missing } from './errors.ts'
import { currencyCode, currencyDecimals } from './money.ts'
import { text, key, dateOnly, timezone, uuid } from './validation.ts'
import type { AccountingContext, PeriodRow } from './context.ts'
import type { CurrencyInput, PeriodInput, PeriodStatusInput, SetupBookInput } from './types.ts'
export function createBookService(ctx: AccountingContext) {
  const { db, transaction, actorFor, bookFor, audit } = ctx
  function setupBook(input: SetupBookInput) {
    const currency = currencyCode(input.baseCurrency)
    const decimals = currencyDecimals(input.baseDecimals)
    const tz = timezone(input.timezone)
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.configure')
      if (db.prepare('SELECT 1 FROM accounting_books WHERE organization_id=? AND company_id=?').get(actor.organizationId, input.companyId))
        return conflict('Accounting book is already configured')
      db.prepare('INSERT INTO accounting_books(organization_id,company_id,base_currency,timezone) VALUES(?,?,?,?)').run(actor.organizationId, input.companyId, currency, tz)
      db.prepare('INSERT INTO accounting_currencies(organization_id,company_id,code,decimals,name) VALUES(?,?,?,?,?)').run(actor.organizationId, input.companyId, currency, decimals, currency)
      audit(actor, input.companyId, 'accounting.book.setup', 'company', input.companyId, { baseCurrency: currency, decimals })
      return { companyId: input.companyId, baseCurrency: currency, baseDecimals: decimals, timezone: tz }
    })
  }
  function addCurrency(input: CurrencyInput) {
    const currency = currencyCode(input.code)
    const decimals = currencyDecimals(input.decimals)
    const name = text(input.name, 'Currency name')
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.configure')
      bookFor(actor, input.companyId)
      if (db.prepare('SELECT 1 FROM accounting_currencies WHERE organization_id=? AND company_id=? AND code=?').get(actor.organizationId, input.companyId, currency))
        return conflict('Currency already configured')
      db.prepare('INSERT INTO accounting_currencies(organization_id,company_id,code,decimals,name) VALUES(?,?,?,?,?)').run(actor.organizationId, input.companyId, currency, decimals, name)
      audit(actor, input.companyId, 'accounting.currency.add', 'currency', currency)
      return { code: currency, decimals, name }
    })
  }
  function listCurrencies(input: {
    sessionToken: string
    companyId: string
  }) {
    const actor = actorFor(input, 'accounting.read')
    bookFor(actor, input.companyId)
    return rowsAs<{
      code: string
      name: string
      decimals: number
    }>(db.prepare('SELECT code,name,decimals FROM accounting_currencies WHERE organization_id=? AND company_id=? ORDER BY code').all(actor.organizationId, input.companyId))
  }
  function addPeriod(input: PeriodInput) {
    const periodCode = key(input.code, 'Period code')
    const start = dateOnly(input.startsOn, 'startsOn'), end = dateOnly(input.endsOn, 'endsOn')
    if (start > end)
      return invalid('Period start must not follow its end')
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.configure')
      bookFor(actor, input.companyId)
      const already = db.prepare('SELECT 1 FROM fiscal_periods WHERE organization_id=? AND company_id=? AND starts_on<=? AND ends_on>=?').get(actor.organizationId, input.companyId, end, start)
      if (already)
        return conflict('Fiscal period date ranges cannot overlap')
      if (db.prepare('SELECT 1 FROM fiscal_periods WHERE organization_id=? AND company_id=? AND code=?').get(actor.organizationId, input.companyId, periodCode))
        return conflict('Period code already exists')
      const id = randomUUID()
      db.prepare('INSERT INTO fiscal_periods(id,organization_id,company_id,code,starts_on,ends_on) VALUES(?,?,?,?,?,?)').run(id, actor.organizationId, input.companyId, periodCode, start, end)
      audit(actor, input.companyId, 'accounting.period.create', 'fiscal_period', id)
      return { id, code: periodCode, startsOn: start, endsOn: end, status: 'open' as const }
    })
  }
  function setPeriodStatus(input: PeriodStatusInput) {
    uuid(input.periodId, 'periodId')
    if (input.status !== 'open' && input.status !== 'closed')
      return invalid('Invalid fiscal period status')
    return transaction(db, () => {
      const actor = actorFor(input, 'accounting.close')
      bookFor(actor, input.companyId)
      const period = rowAs<PeriodRow>(db.prepare('SELECT id,code,starts_on,ends_on,status FROM fiscal_periods WHERE id=? AND organization_id=? AND company_id=?').get(input.periodId, actor.organizationId, input.companyId))
      if (!period)
        return missing()
      if (period.status === input.status)
        return { ...period, changed: false }
      db.prepare('UPDATE fiscal_periods SET status=? WHERE id=? AND organization_id=? AND company_id=?').run(input.status, input.periodId, actor.organizationId, input.companyId)
      audit(actor, input.companyId, input.status === 'closed' ? 'accounting.period.close' : 'accounting.period.reopen', 'fiscal_period', input.periodId)
      return { ...period, status: input.status, changed: true }
    })
  }
  function listPeriods(input: {
    sessionToken: string
    companyId: string
  }) {
    const actor = actorFor(input, 'accounting.read')
    bookFor(actor, input.companyId)
    return rowsAs<PeriodRow>(db.prepare('SELECT id,code,starts_on,ends_on,status FROM fiscal_periods WHERE organization_id=? AND company_id=? ORDER BY starts_on').all(actor.organizationId, input.companyId))
  }
  function getBook(input: {
    sessionToken: string
    companyId: string
  }) {
    const actor = actorFor(input, 'accounting.read')
    return bookFor(actor, input.companyId)
  }
  return Object.freeze({ setupBook, addCurrency, listCurrencies, addPeriod, setPeriodStatus, listPeriods, getBook })
}
