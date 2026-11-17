import { useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { ApiError, type Account, type Book, type List, type Currency } from '../lib/api'
import { languages } from '../lib/i18n'

export function Settings(){
  const {call,companyId,locale}=useApplication()
  const [book,setBook]=useState<Book|null>(null)
  const [accounts,setAccounts]=useState<Account[]>([])
  const [currencies,setCurrencies]=useState<Currency[]>([])
  const [currency,setCurrency]=useState('IRR'),[decimals,setDecimals]=useState('0'),[timezone,setTimezone]=useState('Asia/Tehran')
  const [periodCode,setPeriodCode]=useState(''),[periodStart,setPeriodStart]=useState(''),[periodEnd,setPeriodEnd]=useState('')
  const [code,setCode]=useState(''),[name,setName]=useState(''),[category,setCategory]=useState<Account['category']>('asset')
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null)
  async function reload(){
    const bookResult=await call<Book>('/api/accounting/book').catch(error=>{if(error instanceof ApiError&&error.status===404)return null;throw error})
    setBook(bookResult)
    if(bookResult){const [a,c]=await Promise.all([call<List<Account>>('/api/accounting/accounts'),call<List<Currency>>('/api/accounting/currencies')]);setAccounts(a.items);setCurrencies(c.items)}
  }
  useEffect(()=>{let active=true;setLoading(true);setError(null);setBook(null);setAccounts([])
    void call<Book>('/api/accounting/book').catch(error=>{if(error instanceof ApiError&&error.status===404)return null;throw error}).then(async b=>{
      if(!active)return;setBook(b)
      if(b){const [a,c]=await Promise.all([call<List<Account>>('/api/accounting/accounts'),call<List<Currency>>('/api/accounting/currencies')]);if(active){setAccounts(a.items);setCurrencies(c.items)}}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[companyId,call])
  const execute=async (operation:()=>Promise<unknown>)=>{
    setBusy(true);setError(null);setNotice(null)
    try{await operation();await reload();setNotice(languages[locale].success)}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)} }
  function setup(e:FormEvent<HTMLFormElement>){e.preventDefault();void execute(()=>call('/api/accounting/book',{baseCurrency:currency,baseDecimals:Number(decimals),timezone}))}
  function addAccount(e:FormEvent<HTMLFormElement>){e.preventDefault();void execute(async()=>{await call('/api/accounting/accounts',{code,name,category});setCode('');setName('')})}
  function addPeriod(e:FormEvent<HTMLFormElement>){e.preventDefault();void execute(async()=>{await call('/api/accounting/periods',{code:periodCode,startsOn:periodStart,endsOn:periodEnd});setPeriodCode('')})}
  return <Page title={languages[locale].settings} description={locale==='fa'?'پیکربندی حسابداری هر شرکت مستقل است.':'Each company maintains independent accounting configuration.'}>
    <Alert text={error}/><Alert text={notice} type="success"/>{loading&&<Spinner/>}
    {!loading&&!book&&<Panel title={languages[locale].setup}><form className="form-grid" onSubmit={setup}>
      <Field label={locale==='fa'?'ارز پایه':'Base currency'}>{id=><input id={id} dir="ltr" maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} required/>}</Field>
      <Field label={locale==='fa'?'رقم اعشار ارز':'Currency decimal places'}>{id=><input id={id} type="number" min={0} max={6} dir="ltr" value={decimals} onChange={e=>setDecimals(e.target.value)} required/>}</Field>
      <Field label={locale==='fa'?'منطقه زمانی':'Timezone'}>{id=><input id={id} dir="ltr" value={timezone} onChange={e=>setTimezone(e.target.value)} required/>}</Field>
      <div className="form-actions"><Submit busy={busy}>{locale==='fa'?'ایجاد دفتر حسابداری':'Create accounting book'}</Submit></div>
    </form><p className="muted fine-print">{locale==='fa'?'بعد از نخستین ثبت قطعی، تغییر ارز پایه نیازمند فرآیند کنترل‌شده است.':'Base currency cannot be changed casually after posting.'}</p></Panel>}
    {book&&<>
      <Panel title={locale==='fa'?'دفتر حسابداری':'Accounting book'}>
        <div className="summary-line"><span>{locale==='fa'?'ارز پایه':'Base currency'}: <strong dir="ltr">{book.base_currency}</strong></span><span>{locale==='fa'?'منطقه زمانی':'Timezone'}: <strong dir="ltr">{book.timezone}</strong></span></div>
        <p className="muted fine-print">{locale==='fa'?'ارزهای تعریف‌شده':'Configured currencies'}: {currencies.map(c=>`${c.code} (${c.decimals})`).join(' · ')}</p>
      </Panel>
      <Panel title={locale==='fa'?'دوره مالی جدید':'Add fiscal period'}><form className="form-grid" onSubmit={addPeriod}>
        <Field label={locale==='fa'?'کد دوره':'Period code'}>{id=><input id={id} value={periodCode} onChange={e=>setPeriodCode(e.target.value)} required/>}</Field>
        <Field label={locale==='fa'?'تاریخ آغاز':'Start date'}>{id=><input id={id} type="date" dir="ltr" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} required/>}</Field>
        <Field label={locale==='fa'?'تاریخ پایان':'End date'}>{id=><input id={id} type="date" dir="ltr" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} required/>}</Field>
        <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
      </form></Panel>
      <Panel title={locale==='fa'?'حساب جدید':'Add ledger account'}><form className="form-grid" onSubmit={addAccount}>
        <Field label={locale==='fa'?'کد حساب':'Account code'}>{id=><input id={id} value={code} onChange={e=>setCode(e.target.value)} dir="ltr" required/>}</Field>
        <Field label={languages[locale].name}>{id=><input id={id} value={name} onChange={e=>setName(e.target.value)} required/>}</Field>
        <Field label={locale==='fa'?'گروه حساب':'Category'}>{id=><select id={id} value={category} onChange={e=>setCategory(e.target.value as Account['category'])}>
          <option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option>
        </select>}</Field>
        <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
      </form></Panel>
      <Panel title={locale==='fa'?'سرفصل‌های حسابداری':'Chart of accounts'}>
        {accounts.length===0?<Empty/>:<div className="table-wrap"><table><thead><tr><th>{locale==='fa'?'کد':'Code'}</th><th>{languages[locale].name}</th><th>{locale==='fa'?'گروه':'Category'}</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td dir="ltr">{a.code}</td><td>{a.name}</td><td>{a.category}</td></tr>)}</tbody></table></div>}
      </Panel>
    </>}
  </Page>
}
