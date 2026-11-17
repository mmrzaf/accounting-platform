import { useEffect, useState } from 'react'
import { useApplication } from '../app/context'
import { Alert, Page, Panel, Spinner } from '../components/ui'
import { money, type Currency, type List, type FinancialSummary } from '../lib/api'
import { languages } from '../lib/i18n'

export function Overview() {
  const { companyId, call, locale } = useApplication()
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true); setSummary(null); setError(null)
    void Promise.all([call<FinancialSummary>('/api/accounting/financial-summary'),call<List<Currency>>('/api/accounting/currencies')])
      .then(([value,currencyList]) => { if (active) {setSummary(value);setCurrencies(currencyList.items)} })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId, call])
  const decimals = currencies.find(c => c.code === summary?.baseCurrency)?.decimals ?? 0
  return <Page title={languages[locale].home} description={locale === 'fa' ? 'خلاصه‌ای از وضعیت مالی شرکت بر اساس دفتر کل ثبت‌شده.' : 'Company balances derived from posted journal entries.'}>
    {loading && <Spinner/>}<Alert text={error} type="info"/>
    {summary && <div className="metrics">
      {[
        [locale === 'fa' ? 'دارایی‌ها' : 'Assets', summary.assetsMinor],
        [locale === 'fa' ? 'بدهی‌ها' : 'Liabilities', summary.liabilitiesMinor],
        [locale === 'fa' ? 'درآمد' : 'Revenue', summary.revenueMinor],
        [locale === 'fa' ? 'هزینه‌ها' : 'Expenses', summary.expensesMinor],
        [locale === 'fa' ? 'سود / زیان' : 'Net income', summary.netIncomeMinor],
      ].map(([label, amount]) => <div className="metric panel" key={label}><span className="muted">{label}</span>
        <strong dir="ltr">{money(amount!, decimals, locale, summary.baseCurrency)}</strong></div>)}
    </div>}
    <Panel title={locale === 'fa' ? 'شروع کار' : 'Getting started'}>
      <p className="muted">{locale === 'fa' ? 'برای استفاده از فاکتور و دریافت و پرداخت، ابتدا دفتر حسابداری، دوره مالی و حساب‌های مربوط را در تنظیمات مشخص کنید. معاملات بدون ثبت قطعی در دفتر کل تأثیری ندارند.'
        : 'Configure the accounting book, fiscal period, and chart of accounts in Settings. Draft transactions do not affect the general ledger until posted.'}</p>
    </Panel>
  </Page>
}
