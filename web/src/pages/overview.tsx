import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useApplication } from '../app/context'
import { AccountingOnboarding } from '../components/accounting-onboarding'
import { Icon, type IconName } from '../components/icons'
import { Alert, Page, Spinner } from '../components/ui'
import { ApiError, money, type Account, type Book, type Contact, type Currency, type FinancialSummary, type Invoice, type List, type Payment } from '../lib/api'
import { languages } from '../lib/i18n'
import { displayDate } from '../lib/dates'

interface Period {id:string;code:string;startsOn:string;endsOn:string;status:string}
interface DashboardData {
  book:Book|null; accountingVisible:boolean; accounts:Account[]; periods:Period[]; currencies:Currency[];
  financial:FinancialSummary|null; invoices:Invoice[]; payments:Payment[]; contacts:Contact[]
}
const initial:DashboardData={book:null,accountingVisible:true,accounts:[],periods:[],currencies:[],financial:null,invoices:[],payments:[],contacts:[]}
function ActionTile({to,icon,title,description}:{to:'/contacts'|'/invoices'|'/payments';icon:IconName;title:string;description:string}) {
  return <Link to={to} className="action-tile"><span className="action-tile-symbol"><Icon name={icon} size={20}/></span>
    <span><strong>{title}</strong><small>{description}</small></span><Icon name="chevron" size={18}/></Link>
}
export function Overview(){
  const {call,locale,session,openAssistant}=useApplication()
  const fa=locale==='fa'
  const [data,setData]=useState<DashboardData>(initial)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
  const reload=useCallback(async()=>{
    const optional=async<T,>(path:string,fallback:T):Promise<T>=>call<T>(path).catch(cause=>{
      if(cause instanceof ApiError&&(cause.status===403||cause.status===404))return fallback
      throw cause
    })
    let accountingVisible=true
    const book=await call<Book>('/api/accounting/book').catch(cause=>{
      if(cause instanceof ApiError&&cause.status===404)return null
      if(cause instanceof ApiError&&cause.status===403){accountingVisible=false;return null}
      throw cause
    })
    const [accounts,periods,currencies,financial,invoices,payments,contacts]=await Promise.all([
      book?optional<List<Account>>('/api/accounting/accounts',{items:[]}):Promise.resolve({items:[] as Account[]}),
      book?optional<List<Period>>('/api/accounting/periods',{items:[]}):Promise.resolve({items:[] as Period[]}),
      book?optional<List<Currency>>('/api/accounting/currencies',{items:[]}):Promise.resolve({items:[] as Currency[]}),
      book?optional<FinancialSummary|null>('/api/accounting/financial-summary',null):Promise.resolve(null),
      optional<List<Invoice>>('/api/business/invoices?kind=sale&limit=100',{items:[]}),
      optional<List<Payment>>('/api/business/payments?limit=100',{items:[]}),
      optional<List<Contact>>('/api/business/contacts',{items:[]}),
    ])
    setData({book,accountingVisible,accounts:accounts.items,periods:periods.items,currencies:currencies.items,financial,
      invoices:invoices.items,payments:payments.items,contacts:contacts.items})
  },[call])
  useEffect(()=>{let active=true;setLoading(true);setError(null)
    void reload().catch(cause=>{if(active)setError(cause instanceof Error?cause.message:String(cause))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[reload])
  const refresh=async()=>{await reload()}
  const financial=data.financial
  const decimals=data.currencies.find(currency=>currency.code===financial?.baseCurrency)?.decimals??0
  const balance=(minor:string)=>money(minor,decimals,locale,financial?.baseCurrency)
  const needsSetup=data.accountingVisible&&(!data.book||data.accounts.length===0||data.periods.length===0)
  const outstanding=data.invoices.filter(invoice=>invoice.status==='posted'&&BigInt(invoice.outstandingMinor)>0n)
    .sort((a,b)=>b.issuedOn.localeCompare(a.issuedOn)).slice(0,5)
  const recent=[...data.invoices.map(i=>({id:i.id,date:i.issuedOn,kind:i.kind==='sale'?'sale':'purchase',description:i.description,amount:i.totalMinor,number:i.number})),
    ...data.payments.map(p=>({id:p.id,date:p.paidOn,kind:p.kind,description:p.description,amount:p.amountMinor,number:p.number}))]
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6)
  const names:Record<string,string>=fa?{sale:'فروش',purchase:'خرید',receipt:'دریافت',payment:'پرداخت'}:
    {sale:'Sale',purchase:'Purchase',receipt:'Receipt',payment:'Payment'}
  return <Page title={languages[locale].home} description={fa?`خوش آمدید، ${session?.user.displayName??''}. نمایی روشن از کسب‌وکار شما.`:`Welcome back, ${session?.user.displayName??''}. Your financial workspace.`}
    actions={<button type="button" className="secondary" onClick={()=>{setLoading(true);void refresh().catch(c=>setError(c instanceof Error?c.message:String(c))).finally(()=>setLoading(false))}}><Icon name="refresh" size={17}/>{fa?'به‌روزرسانی':'Refresh'}</button>}>
    <Alert text={error}/>
    {loading?<div className="dashboard-loading"><Spinner/></div>:<>
      {!data.accountingVisible&&<div className="scope-note"><Icon name="ledger" size={18}/>{fa?'نمای مالی با نقش فعلی شما در دسترس نیست. برای دریافت دسترسی با مدیر شرکت صحبت کنید.':'Financial summaries are restricted by your role. Ask your company administrator for access.'}</div>}
      {needsSetup&&<AccountingOnboarding readiness={{book:data.book,accountCount:data.accounts.length,periodCount:data.periods.length}} onComplete={reload}/>}
      {!needsSetup&&<>
      {financial&&<div className="dashboard-metrics">
        {[
          {label:fa?'دارایی‌ها':'Assets',value:financial.assetsMinor,icon:'ledger' as const},
          {label:fa?'بدهی‌ها':'Liabilities',value:financial.liabilitiesMinor,icon:'payment' as const},
          {label:fa?'درآمد ثبت‌شده':'Recorded revenue',value:financial.revenueMinor,icon:'invoice' as const},
          {label:fa?'سود / زیان':'Net result',value:financial.netIncomeMinor,icon:'home' as const},
        ].map(stat=><div className="dashboard-metric" key={stat.label}><div className="metric-top"><span>{stat.label}</span><Icon name={stat.icon} size={18}/></div>
          <strong dir="ltr">{balance(stat.value)}</strong><span className="metric-foot">{fa?'بر اساس اسناد قطعی':'Based on posted entries'}</span></div>)}
      </div>}
      <div className="dashboard-section-heading"><div><h2>{fa?'دسترسی سریع':'Quick actions'}</h2><p className="muted">{fa?'کارهای روزمره را از همین‌جا آغاز کنید.':'Pick up your day-to-day tasks.'}</p></div></div>
      <div className="dashboard-actions">
        <ActionTile to="/invoices" icon="invoice" title={fa?'ثبت فاکتور':'New invoice'} description={fa?'فروش یا خرید':'Sales and purchases'}/>
        <ActionTile to="/payments" icon="payment" title={fa?'دریافت و پرداخت':'Record payment'} description={fa?'تسویه فاکتورها':'Receipts and settlements'}/>
        <ActionTile to="/contacts" icon="contacts" title={fa?'مدیریت اشخاص':'Contacts'} description={fa?'مشتریان و تأمین‌کنندگان':'Customers and suppliers'}/>
      </div>
      <div className="dashboard-columns">
        <section className="panel dashboard-table-panel"><div className="section-heading"><h2>{fa?'فاکتورهای تسویه‌نشده':'Open invoices'}</h2><Link className="inline-action" to="/invoices">{fa?'همه فاکتورها':'View invoices'} <Icon name="chevron" size={15}/></Link></div>
          {outstanding.length===0?<div className="dashboard-empty"><span className="dashboard-empty-icon"><Icon name="invoice" size={22}/></span><strong>{fa?'فاکتور بازی وجود ندارد':'No unpaid invoices'}</strong><p>{fa?'وقتی فاکتور نسیه ثبت کنید، مانده آن اینجا نشان داده می‌شود.':'Outstanding invoice balances appear here once recorded.'}</p></div>:
            <div className="dashboard-list">{outstanding.map(invoice=><Link key={invoice.id} to="/invoices" search={{record:invoice.id}} className="dashboard-list-row"><span><strong>{invoice.number??invoice.description}</strong><small>{displayDate(invoice.issuedOn,locale)}</small></span>
              <strong className="amount" dir="ltr">{balance(invoice.outstandingMinor)}</strong><Icon name="chevron" size={16}/></Link>)}</div>}
        </section>
        <section className="panel dashboard-table-panel"><div className="section-heading"><h2>{fa?'آخرین فعالیت‌ها':'Recent activity'}</h2><button type="button" className="text-button" onClick={()=>openAssistant(fa?'فعالیت‌های مالی اخیر را خلاصه کن':'Summarize recent financial activity')}><Icon name="assistant" size={15}/>{fa?'تحلیل با دستیار':'Ask AI'}</button></div>
          {recent.length===0?<div className="dashboard-empty"><span className="dashboard-empty-icon"><Icon name="ledger" size={22}/></span><strong>{fa?'هنوز سندی ثبت نشده':'Nothing recorded yet'}</strong><p>{fa?'پس از ثبت نخستین سند، فعالیت‌های اخیر را اینجا خواهید دید.':'Your latest business documents will appear here.'}</p></div>:
            <div className="dashboard-list">{recent.map(item=><Link key={`${item.kind}-${item.id}`} to={item.kind==='sale'||item.kind==='purchase'?'/invoices':'/payments'} search={{record:item.id}} className="dashboard-list-row"><span><strong>{names[item.kind]} · {item.number??item.description}</strong><small>{displayDate(item.date,locale)}</small></span>
              {financial&&<strong className="amount" dir="ltr">{balance(item.amount)}</strong>}<Icon name="chevron" size={16}/></Link>)}</div>}
        </section>
      </div>
      </>}
    </>}
  </Page>
}
