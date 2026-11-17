import { AskAssistant } from '../components/ask-assistant'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner } from '../components/ui'
import { SearchBox, SectionHeading, SummaryValue } from '../components/workflow'
import { money, type Account, type Currency, type List, type TrialBalance } from '../lib/api'

interface LedgerRow { journalId: string; lineId: string; date: string; description: string; debitMinor: string; creditMinor: string; balanceMinor: string }
interface LedgerResult { accountCode: string; baseCurrency: string; rows: LedgerRow[]; openingNetDebitMinor: string; closingNetDebitMinor: string; totalRows: number; offset: number; limit: number }
const pageSize = 100

export function Ledger() {
  const { call, locale, setAssistantSelection } = useApplication()
  const fa = locale === 'fa'
  const [trial,setTrial] = useState<TrialBalance|null>(null)
  const [accounts,setAccounts] = useState<Account[]>([])
  const [currencies,setCurrencies] = useState<Currency[]>([])
  const [accountId,setAccountId] = useState('')
  const [accountSearch,setAccountSearch] = useState('')
  const [from,setFrom] = useState('')
  const [through,setThrough] = useState('')
  const [period,setPeriod] = useState<{from:string;through:string}>({from:'',through:''})
  const [offset,setOffset] = useState(0)
  const [ledger,setLedger] = useState<LedgerResult|null>(null)
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(true)
  const [ledgerLoading,setLedgerLoading] = useState(false)
  const decimals = currencies.find(c=>c.code===trial?.baseCurrency)?.decimals ?? 0
  const currency = trial?.baseCurrency ?? ''
  const visibleAccounts = useMemo(()=>trial?.rows.filter(row=>`${row.code} ${row.name}`.toLocaleLowerCase().includes(accountSearch.toLocaleLowerCase()))??[],[trial,accountSearch])
  const selectedAccount = accounts.find(a=>a.id===accountId)
  const selectedSummary = trial?.rows.find(a=>a.accountId===accountId)
  const summaryNet = selectedSummary ? (BigInt(selectedSummary.balanceDebitMinor)-BigInt(selectedSummary.balanceCreditMinor)).toString() : '0'
  const params = useCallback(() => new URLSearchParams({...(period.through?{through:period.through}:{})}),[period])
  useEffect(()=>{let active=true;setLoading(true);setError(null)
    void Promise.all([call<List<Account>>('/api/accounting/accounts'),call<List<Currency>>('/api/accounting/currencies')])
      .then(([a,c])=>{if(active){setAccounts(a.items);setCurrencies(c.items)}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[call])
  useEffect(()=>{let active=true;setLoading(true)
    void call<TrialBalance>(`/api/accounting/trial-balance?${params()}`)
      .then(t=>{if(active)setTrial(t)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[call,params])
  useEffect(()=>{let active=true;setLedger(null);if(!accountId)return
    setLedgerLoading(true)
    const query = new URLSearchParams({accountId,limit:String(pageSize),offset:String(offset),...(period.from?{from:period.from}:{}),...(period.through?{through:period.through}:{})})
    void call<LedgerResult>(`/api/accounting/ledger?${query}`)
      .then(result=>{if(active)setLedger(result)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(active)setLedgerLoading(false)})
    return()=>{active=false}
  },[accountId,offset,period,call])
  function applyPeriod(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(from && through && from>through) {setError(fa?'تاریخ آغاز نباید بعد از تاریخ پایان باشد.':'Start date must not be later than end date.');return}
    setError(null);setOffset(0);setPeriod({from,through})
  }
  function chooseAccount(id:string) {setAccountId(id);setOffset(0)}
  useEffect(()=>{
    const recordId=accountId||undefined
    setAssistantSelection({page:'ledger',...(recordId?{record:{type:'account' as const,id:recordId}}:{})})
    return ()=>setAssistantSelection(null)
  },[accountId||undefined,setAssistantSelection])
  return <Page title={fa?'حسابداری و دفتر کل':'Accounting & ledger'}
    description={fa?'مانده حساب‌ها و گردش اسناد قطعی، محاسبه‌شده از دفتر کل':'Posted journal balances and account movements, derived from the general ledger'}
    actions={<AskAssistant prompt={fa?'مانده‌ها و تغییرات حساب‌های این صفحه را توضیح بده':'Explain account balances and changes in this ledger'}/>}>
    <Alert text={error}/>
    <Panel><SectionHeading>{fa?'بازه گزارش':'Reporting period'}</SectionHeading>
      <form className="report-filters" onSubmit={applyPeriod}>
        <Field label={fa?'از تاریخ':'From'}>{id=><input type="date" id={id} dir="ltr" value={from} onChange={e=>setFrom(e.target.value)}/>}</Field>
        <Field label={fa?'تا تاریخ':'Through'}>{id=><input type="date" id={id} dir="ltr" value={through} onChange={e=>setThrough(e.target.value)}/>}</Field>
        <button type="submit">{fa?'اعمال':'Apply'}</button><button type="button" className="secondary" onClick={()=>{setFrom('');setThrough('');setPeriod({from:'',through:''});setOffset(0);setError(null)}}>{fa?'همه تاریخ‌ها':'All dates'}</button>
      </form>
      <p className="muted fine-print">{fa?'تراز آزمایشی مانده تجمعی تا تاریخ پایان است؛ تاریخ آغاز فقط بر گردش انتخاب‌شده اعمال می‌شود.':'Trial balance is cumulative through the end date; the start date only filters account movements.'}</p>
    </Panel>
    <Panel><SectionHeading actions={<SearchBox value={accountSearch} onChange={setAccountSearch} label={fa?'جست‌وجوی حساب‌ها':'Search accounts'} placeholder={fa?'کد یا عنوان حساب':'Code or name'}/>}>{fa?'تراز آزمایشی':'Trial balance'}</SectionHeading>
      {loading?<Spinner/>:trial?(visibleAccounts.length===0?<Empty message={fa?'حسابی پیدا نشد.':'No matching accounts.'}/>:<div className="table-wrap"><table><thead><tr><th>{fa?'کد':'Code'}</th><th>{fa?'حساب':'Account'}</th><th>{fa?'گروه':'Category'}</th><th className="numeric">{fa?'بدهکار':'Debit'}</th><th className="numeric">{fa?'بستانکار':'Credit'}</th></tr></thead>
        <tbody>{visibleAccounts.map(row=><tr key={row.accountId} className={row.accountId===accountId?'selected-table-row':''}>
          <td dir="ltr">{row.code}</td><td><button type="button" className="table-link" onClick={()=>chooseAccount(row.accountId)} aria-label={`${fa?'مشاهده گردش':'View movements'} ${row.name}`}>{row.name}</button></td><td>{row.category}</td>
          <td className="numeric">{money(row.balanceDebitMinor,decimals,locale)}</td><td className="numeric">{money(row.balanceCreditMinor,decimals,locale)}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={3}>{fa?'جمع همه حساب‌ها':'All-account totals'}</th>
          <th className="numeric">{money(trial.totalDebitMinor,decimals,locale,currency)}</th><th className="numeric">{money(trial.totalCreditMinor,decimals,locale,currency)}</th></tr></tfoot>
      </table></div>):<Empty/>}
    </Panel>
    <Panel><SectionHeading>{fa?'گردش حساب':'Account movements'}</SectionHeading>
      <div className="toolbar"><label htmlFor="ledger-account">{fa?'حساب':'Account'}</label>
        <select id="ledger-account" value={accountId} onChange={event=>chooseAccount(event.target.value)}><option value="">{fa?'انتخاب حساب':'Select account'}</option>
          {accounts.filter(a=>a.postable).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select></div>
      {selectedAccount&&<div className="record-overview"><SummaryValue label={fa?'حساب':'Account'} value={`${selectedAccount.code} · ${selectedAccount.name}`}/>
        <SummaryValue label={fa?'مانده بدهکار (خالص)':'Net debit balance'} value={money(summaryNet,decimals,locale,currency)}/>
        {ledger&&<SummaryValue label={fa?'تعداد گردش':'Movements'} value={String(ledger.totalRows)}/>}</div>}
      {!accountId?<p className="muted">{fa?'برای مشاهده گردش، روی نام یک حساب در تراز آزمایشی کلیک کنید.':'Select an account above to inspect its posted movements.'}</p>:
      ledgerLoading?<Spinner/>:ledger?(<>
        <div className="summary-line ledger-balances"><span>{fa?'مانده ابتدای بازه':'Opening balance'}: <strong dir="ltr">{money(ledger.openingNetDebitMinor,decimals,locale,currency)}</strong></span>
          <span>{fa?'مانده پایان بازه':'Closing balance'}: <strong dir="ltr">{money(ledger.closingNetDebitMinor,decimals,locale,currency)}</strong></span></div>
        {ledger.rows.length===0?<Empty message={fa?'گردشی در این بازه وجود ندارد.':'No posted movements in this range.'}/>:<div className="table-wrap"><table><thead><tr><th>{fa?'تاریخ':'Date'}</th><th>{fa?'شرح سند':'Description'}</th><th className="numeric">{fa?'بدهکار':'Debit'}</th><th className="numeric">{fa?'بستانکار':'Credit'}</th><th className="numeric">{fa?'مانده':'Balance'}</th></tr></thead>
          <tbody>{ledger.rows.map(row=><tr key={row.lineId}><td dir="ltr">{row.date}</td><td className="cell-description">{row.description}</td><td className="numeric">{money(row.debitMinor,decimals,locale)}</td>
            <td className="numeric">{money(row.creditMinor,decimals,locale)}</td><td className="numeric">{money(row.balanceMinor,decimals,locale)}</td></tr>)}</tbody></table></div>}
        <div className="register-pagination"><span className="muted">{ledger.totalRows===0?'0':`${offset+1}–${Math.min(offset+ledger.rows.length,ledger.totalRows)}`} / {ledger.totalRows}</span>
          <div className="document-actions"><button type="button" className="secondary small" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>{fa?'قبلی':'Previous'}</button>
            <button type="button" className="secondary small" disabled={offset+pageSize>=ledger.totalRows} onClick={()=>setOffset(offset+pageSize)}>{fa?'بعدی':'Next'}</button></div></div>
      </>):<Empty message={fa?'گردش قابل بارگذاری نبود.':'Could not load account movements.'}/>}
    </Panel>
  </Page>
}
