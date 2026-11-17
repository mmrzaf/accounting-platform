import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useApplication } from '../app/context'
import { Icon } from './icons'
import { Alert, Field, Submit } from './ui'
import { today, type Book } from '../lib/api'

type Readiness = { book: Book | null; accountCount: number; periodCount: number }

/** First-run setup uses the same authorized accounting services as Settings. Never invents financial entries. */
export function AccountingOnboarding({readiness,onComplete}:{readiness:Readiness;onComplete:()=>Promise<void>}) {
  const {call,locale}=useApplication()
  const fa=locale==='fa'
  const [currency,setCurrency]=useState('IRR')
  const [timezone,setTimezone]=useState('Asia/Tehran')
  const year=Number(today().slice(0,4))
  const [from,setFrom]=useState(`${year}-01-01`)
  const [through,setThrough]=useState(`${year}-12-31`)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const step=!readiness.book?0:readiness.accountCount===0?1:readiness.periodCount===0?2:3
  const labels=fa?['دفتر حسابداری','حساب‌های پایه','دوره مالی']:['Accounting book','Chart of accounts','Fiscal period']
  async function proceed(action:()=>Promise<unknown>){
    setBusy(true);setError(null)
    try{await action();await onComplete()}catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
  }
  function createBook(event:FormEvent<HTMLFormElement>){event.preventDefault();void proceed(()=>call('/api/accounting/book',{
    baseCurrency:currency,baseDecimals:currency==='IRR'||currency==='IRT'?0:2,timezone,
  }))}
  function createPeriod(event:FormEvent<HTMLFormElement>){event.preventDefault();if(from>through){setError(fa?'تاریخ پایان باید بعد از آغاز باشد.':'End date must follow start date.');return}
    void proceed(()=>call('/api/accounting/periods',{code:`FY-${from.slice(0,4)}`,startsOn:from,endsOn:through}))
  }
  return <section className="onboarding" aria-labelledby="onboarding-title">
    <div className="onboarding-intro">
      <div className="onboarding-eyebrow"><Icon name="check" size={15}/>{fa?'راه‌اندازی اولیه':'FIRST-TIME SETUP'}</div>
      <h2 id="onboarding-title">{fa?'حسابداری شرکت را آماده کنید':'Get your accounts ready'}</h2>
      <p>{fa?'سه گام کوتاه برای شروع. اطلاعات مالی تا زمان ثبت قطعی سند، تغییری نمی‌کند.':'Three clear steps to get started. No journal entries are posted during setup.'}</p>
      <div className="setup-progress" role="list" aria-label={fa?'مراحل راه‌اندازی':'Setup steps'}>
        {labels.map((label,index)=><div role="listitem" className={`setup-step ${index<step?'complete':index===step?'current':''}`} key={label}>
          <span className="setup-step-number">{index<step?<Icon name="check" size={15}/>:index+1}</span><span>{label}</span>
        </div>)}
      </div>
    </div>
    <div className="onboarding-form">
      <Alert text={error}/>
      {step===0&&<form className="stack" onSubmit={createBook}>
        <h3>{fa?'۱. تنظیم ارز و منطقه زمانی':'1. Currency and timezone'}</h3>
        <p className="muted">{fa?'ارز پایه مبنای تمام گزارش‌های مالی خواهد بود. انتخاب آن را بررسی کنید.':'Your base currency is the reporting currency. Choose carefully.'}</p>
        <Field label={fa?'ارز پایه':'Base currency'}>{id=><select id={id} value={currency} onChange={e=>setCurrency(e.target.value)}>
          <option value="IRR">IRR — {fa?'ریال ایران':'Iranian rial'}</option><option value="IRT">IRT — {fa?'تومان (نمایش مستقل)':'Toman (separate currency)'}</option>
          <option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option>
        </select>}</Field>
        <Field label={fa?'منطقه زمانی':'Timezone'}>{id=><select id={id} value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="Asia/Tehran">Asia/Tehran</option><option value="UTC">UTC</option><option value="Europe/Berlin">Europe/Berlin</option></select>}</Field>
        <div className="setup-action"><Submit busy={busy}>{fa?'ایجاد دفتر و ادامه':'Create book and continue'}</Submit></div>
      </form>}
      {step===1&&<div className="stack">
        <h3>{fa?'۲. آماده‌سازی حساب‌های پایه':'2. Create your starting chart'}</h3>
        <p className="muted">{fa?'یک کدینگ ساده با حساب‌های فروش، خرید، دریافتنی، پرداختنی و بانک ایجاد می‌شود. بعداً از تنظیمات قابل توسعه است.':'Creates a basic, editable chart for sales, purchases, receivables, payables, and cash.'}</p>
        <p className="setup-caution">{fa?'این کدینگ استاندارد قانونی یا مالیاتی نیست. برای استفاده واقعی، آن را با حسابدار خود بازبینی کنید.':'This is not a certified statutory chart. Review it with your accountant before live use.'}</p>
        <div className="setup-action"><button disabled={busy} onClick={()=>void proceed(()=>call('/api/accounting/starter-chart',{locale}))}>{fa?'ساخت حساب‌های پایه':'Create starting accounts'}</button></div>
      </div>}
      {step===2&&<form className="stack" onSubmit={createPeriod}>
        <h3>{fa?'۳. تعیین دوره مالی':'3. Choose your fiscal period'}</h3>
        <p className="muted">{fa?'تاریخ‌های زیر به صورت میلادی ذخیره می‌شوند. تقویم فارسی در نمایش اطلاعات پشتیبانی می‌شود.':'Dates are stored canonically; Persian calendar formatting is available in the interface.'}</p>
        <div className="form-grid"><Field label={fa?'از تاریخ':'Start date'}>{id=><input id={id} type="date" dir="ltr" required value={from} onChange={e=>setFrom(e.target.value)}/>}</Field>
          <Field label={fa?'تا تاریخ':'End date'}>{id=><input id={id} type="date" dir="ltr" required value={through} onChange={e=>setThrough(e.target.value)}/>}</Field></div>
        <div className="setup-action"><Submit busy={busy}>{fa?'ایجاد دوره و شروع':'Create period and continue'}</Submit></div>
      </form>}
      {step===3&&<div className="stack"><h3>{fa?'آماده شروع هستید':'Ready for your first transaction'}</h3>
        <p className="muted">{fa?'حالا می‌توانید طرف حساب بسازید و فاکتورهای خود را ثبت کنید.':'You can now create contacts and record invoices.'}</p>
        <div className="document-actions"><Link to="/contacts" className="inline-action">{fa?'افزودن شخص':'Add a contact'}</Link><Link to="/invoices" className="inline-action">{fa?'ثبت فاکتور':'Create invoice'}</Link></div></div>}
    </div>
  </section>
}
