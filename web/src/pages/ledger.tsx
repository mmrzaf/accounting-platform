import { useEffect, useState } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Page, Panel, Spinner } from '../components/ui'
import { money, type Account, type Currency, type List, type TrialBalance } from '../lib/api'
import { languages } from '../lib/i18n'
interface LedgerRow { journalId: string; lineId: string; date: string; description: string; debitMinor: string; creditMinor: string; balanceMinor: string }
interface LedgerResult { accountCode: string; baseCurrency: string; rows: LedgerRow[]; closingNetDebitMinor: string }
export function Ledger(){
  const {call,companyId,locale}=useApplication()
  const [trial,setTrial]=useState<TrialBalance|null>(null)
  const [accounts,setAccounts]=useState<Account[]>([])
  const [currencies,setCurrencies]=useState<Currency[]>([])
  const [accountId,setAccountId]=useState('')
  const [ledger,setLedger]=useState<LedgerResult|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const dec=currencies.find(x=>x.code===trial?.baseCurrency)?.decimals??0
  useEffect(()=>{let active=true;setLoading(true);setError(null);setTrial(null);setLedger(null);setAccountId('')
    void Promise.all([call<TrialBalance>('/api/accounting/trial-balance'),call<List<Account>>('/api/accounting/accounts'),call<List<Currency>>('/api/accounting/currencies')])
      .then(([t,a,c])=>{if(active){setTrial(t);setAccounts(a.items);setCurrencies(c.items)}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[companyId,call])
  useEffect(()=>{let active=true;setLedger(null);if(!accountId)return
    void call<LedgerResult>(`/api/accounting/ledger?accountId=${encodeURIComponent(accountId)}&limit=250`)
      .then(result=>{if(active)setLedger(result)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
    return()=>{active=false}
  },[accountId,call])
  return <Page title={languages[locale].ledger} description={locale==='fa'?'تراز آزمایشی و دفتر حساب‌ها؛ فقط اسناد قطعی':'Trial balance and account history from posted journals'}>
    <Alert text={error}/>{loading&&<Spinner/>}
    <Panel title={locale==='fa'?'تراز آزمایشی':'Trial balance'}>
      {trial?<div className="table-wrap"><table><thead><tr><th>{locale==='fa'?'کد':'Code'}</th><th>{locale==='fa'?'حساب':'Account'}</th><th>{locale==='fa'?'ماهیت':'Category'}</th><th>{locale==='fa'?'بدهکار':'Debit'}</th><th>{locale==='fa'?'بستانکار':'Credit'}</th></tr></thead>
        <tbody>{trial.rows.map(a=><tr key={a.accountId}><td dir="ltr">{a.code}</td><td>{a.name}</td><td>{a.category}</td><td dir="ltr" className="numeric">{money(a.balanceDebitMinor,dec,locale)}</td><td dir="ltr" className="numeric">{money(a.balanceCreditMinor,dec,locale)}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={3}>{locale==='fa'?'جمع':'Totals'}</th><th className="numeric" dir="ltr">{money(trial.totalDebitMinor,dec,locale,trial.baseCurrency)}</th><th className="numeric" dir="ltr">{money(trial.totalCreditMinor,dec,locale,trial.baseCurrency)}</th></tr></tfoot>
      </table></div>:!loading&&<Empty/>}
    </Panel>
    <Panel title={locale==='fa'?'گردش حساب':'Account ledger'}>
      <div className="toolbar"><label htmlFor="ledger-account">{locale==='fa'?'انتخاب حساب':'Select account'}</label><select id="ledger-account" value={accountId} onChange={e=>setAccountId(e.target.value)}>
        <option value="">—</option>{accounts.filter(a=>a.postable).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
      </select></div>
      {ledger?(ledger.rows.length===0?<Empty/>:<div className="table-wrap"><table><thead><tr><th>{languages[locale].date}</th><th>{languages[locale].description}</th><th>{locale==='fa'?'بدهکار':'Debit'}</th><th>{locale==='fa'?'بستانکار':'Credit'}</th><th>{locale==='fa'?'مانده':'Balance'}</th></tr></thead>
        <tbody>{ledger.rows.map(row=><tr key={row.lineId}><td dir="ltr">{row.date}</td><td>{row.description}</td><td dir="ltr" className="numeric">{money(row.debitMinor,dec,locale)}</td><td dir="ltr" className="numeric">{money(row.creditMinor,dec,locale)}</td><td dir="ltr" className="numeric">{money(row.balanceMinor,dec,locale)}</td></tr>)}</tbody></table></div>):!accountId?<p className="muted">{locale==='fa'?'یک حساب انتخاب کنید.':'Choose an account.'}</p>:<Spinner/>}
    </Panel>
  </Page>
}
