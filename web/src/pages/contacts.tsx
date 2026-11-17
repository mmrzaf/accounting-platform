import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { ActionDialog, FilterTabs, SearchBox, SectionHeading, Status } from '../components/workflow'
import { newRequestKey, type Contact, type Invoice, type List, type Payment } from '../lib/api'
import { languages } from '../lib/i18n'

type Filter = 'active'|'all'|'archived'
export function Contacts() {
  const { call, locale } = useApplication()
  const fa=locale==='fa'
  const [items,setItems]=useState<Contact[]>([])
  const [invoices,setInvoices]=useState<Invoice[]>([])
  const [payments,setPayments]=useState<Payment[]>([])
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState<Filter>('active')
  const [selected,setSelected]=useState<Contact|null>(null)
  const [adding,setAdding]=useState(false)
  const [editing,setEditing]=useState(false)
  const [name,setName]=useState('')
  const [code,setCode]=useState('')
  const [requestKey,setRequestKey]=useState(newRequestKey)
  const [confirmArchive,setConfirmArchive]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [notice,setNotice]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const reload=useCallback(async()=>{
    const directory=await call<List<Contact>>('/api/business/contacts')
    setItems(directory.items)
    // Activity is opportunistic: a contact role need not grant trading visibility.
    const responses=await Promise.allSettled([
      call<List<Invoice>>('/api/business/invoices?kind=sale&limit=100'),
      call<List<Invoice>>('/api/business/invoices?kind=purchase&limit=100'),
      call<List<Payment>>('/api/business/payments?limit=100'),
    ])
    setInvoices(responses.slice(0,2).flatMap(result=>result.status==='fulfilled'?(result.value as List<Invoice>).items:[]))
    setPayments(responses[2]?.status==='fulfilled'?(responses[2].value as List<Payment>).items:[])
  },[call])
  useEffect(()=>{let active=true;setLoading(true);setError(null)
    void reload().catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[reload])
  const visible=useMemo(()=>items.filter(c=>(filter==='all'||c.status===filter)&&
    `${c.displayName} ${c.code??''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),[items,filter,search])
  const selectedNow=selected?items.find(c=>c.id===selected.id)??selected:null
  function startNew(){setAdding(true);setEditing(false);setName('');setCode('');setRequestKey(newRequestKey());setError(null)}
  async function saveNew(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError(null);setNotice(null)
    try {const created=await call<Contact>('/api/business/contacts',{displayName:name,code:code.trim()||undefined,requestKey});
      await reload();setSelected(created);setAdding(false);setNotice(languages[locale].success)
    } catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  async function rename(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedNow)return;setBusy(true);setError(null)
    try{const updated=await call<Contact>(`/api/business/contacts/${selectedNow.id}/rename`,{displayName:name,expectedRevision:selectedNow.revision});
      setSelected(updated);setEditing(false);await reload();setNotice(languages[locale].success)
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  async function updateStatus(){if(!selectedNow)return;setBusy(true);setError(null)
    try{const updated=await call<Contact>(`/api/business/contacts/${selectedNow.id}/status`,{status:selectedNow.status==='active'?'archived':'active'});
      setSelected(updated);setConfirmArchive(false);await reload();setNotice(languages[locale].success)
    }catch(e){setError(e instanceof Error?e.message:String(e));setConfirmArchive(false)}finally{setBusy(false)}}
  const relatedInvoices=selectedNow?invoices.filter(i=>i.partyId===selectedNow.id):[]
  const relatedPayments=selectedNow?payments.filter(p=>p.partyId===selectedNow.id):[]
  return <Page title={languages[locale].contacts} description={fa?'پرونده اشخاص، مشتریان و تأمین‌کنندگان در یک فهرست':'One directory for customers, suppliers and other counterparties'}
    actions={<button type="button" onClick={startNew}>{fa?'شخص جدید':'New contact'}</button>}>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <div className="master-detail">
      <Panel><SectionHeading>{fa?'فهرست اشخاص':'Directory'}</SectionHeading>
        <div className="register-tools"><SearchBox value={search} onChange={setSearch} label={fa?'جست‌وجوی اشخاص':'Search contacts'}/>
          <FilterTabs label={fa?'وضعیت':'Status'} value={filter} onChange={setFilter} options={[{value:'active',label:fa?'فعال':'Active'},{value:'all',label:fa?'همه':'All'},{value:'archived',label:fa?'بایگانی':'Archived'}]}/></div>
        {loading?<Spinner/>:visible.length===0?<Empty/>:<div className="contact-list" role="list">{visible.map(c=><button role="listitem" className={`contact-list-item ${selectedNow?.id===c.id?'selected':''}`} key={c.id} onClick={()=>{setSelected(c);setEditing(false);setAdding(false);setError(null)}}>
          <span className="contact-monogram" aria-hidden="true">{c.displayName.trim().slice(0,1).toUpperCase()}</span><span className="contact-list-name"><strong>{c.displayName}</strong><small className="muted" dir="ltr">{c.code??(fa?'بدون کد':'No code')}</small></span><Status value={c.status}/>
        </button>)}</div>}
      </Panel>
      <Panel>
        {adding?<><SectionHeading>{fa?'ایجاد شخص':'New contact'}</SectionHeading><form onSubmit={event=>void saveNew(event)} className="stack">
          <Field label={fa?'نام شخص یا شرکت':'Contact or business name'}>{id=><input id={id} maxLength={160} value={name} onChange={e=>setName(e.target.value)} required autoFocus/>}</Field>
          <Field label={fa?'کد اختیاری':'Code (optional)'}>{id=><input id={id} dir="ltr" maxLength={128} value={code} onChange={e=>setCode(e.target.value)}/>}</Field>
          <div className="document-actions"><button type="button" className="secondary" onClick={()=>setAdding(false)}>{languages[locale].cancel}</button><Submit busy={busy}>{fa?'ایجاد شخص':'Create contact'}</Submit></div></form></>:
          selectedNow?<><SectionHeading actions={<div className="document-actions"><button className="secondary small" onClick={()=>{setName(selectedNow.displayName);setEditing(v=>!v)}}>{editing?(fa?'انصراف':'Cancel'):(fa?'ویرایش نام':'Rename')}</button>
            <button className="text-button" onClick={()=>setConfirmArchive(true)}>{selectedNow.status==='active'?(fa?'بایگانی':'Archive'):(fa?'فعال‌سازی':'Restore')}</button></div>}>{selectedNow.displayName}</SectionHeading>
            <p className="muted">{fa?'طرف حساب':'Counterparty'} · {selectedNow.code??(fa?'بدون کد':'No code')} · <Status value={selectedNow.status}/></p>
            {editing&&<form className="inline-edit" onSubmit={event=>void rename(event)}><Field label={fa?'نام جدید':'New name'}>{id=><input id={id} value={name} onChange={e=>setName(e.target.value)} required maxLength={160}/>}</Field><Submit busy={busy}>{fa?'ذخیره':'Save'}</Submit></form>}
            <div className="record-overview"><div className="summary-value"><span className="muted">{fa?'فاکتورهای اخیر':'Recent invoices'}</span><strong>{relatedInvoices.length}</strong></div><div className="summary-value"><span className="muted">{fa?'دریافت و پرداخت اخیر':'Recent payments'}</span><strong>{relatedPayments.length}</strong></div></div>
            <SectionHeading>{fa?'گردش اخیر':'Recent activity'}</SectionHeading>
            {relatedInvoices.length===0&&relatedPayments.length===0?<Empty message={fa?'سند اخیری در دسترس نیست.':'No recent accessible documents.'}/>:<div className="activity-list">
              {relatedInvoices.slice(0,8).map(invoice=><div className="activity-row" key={invoice.id}><span><strong>{invoice.kind==='sale'?(fa?'فروش':'Sale'):(fa?'خرید':'Purchase')}</strong> · {invoice.description}</span><span dir="ltr">{invoice.issuedOn}</span></div>)}
              {relatedPayments.slice(0,8).map(payment=><div className="activity-row" key={payment.id}><span><strong>{payment.kind==='receipt'?(fa?'دریافت':'Receipt'):(fa?'پرداخت':'Payment')}</strong> · {payment.description}</span><span dir="ltr">{payment.paidOn}</span></div>)}
            </div>}
            <p className="muted fine-print">{fa?'فعالیت‌ها تنها از آخرین اسناد قابل دسترسی نمایش داده می‌شوند؛ برای گزارش کامل از بخش گزارش‌ها استفاده کنید.':'This is a preview of recent accessible records, not a full account statement.'}</p>
            <div className="document-actions"><Link to="/invoices" className="inline-action">{fa?'فاکتورها':'Invoices'}</Link><Link to="/payments" className="inline-action">{fa?'دریافت و پرداخت':'Payments'}</Link></div>
          </>:<div className="detail-placeholder"><h2>{fa?'پرونده شخص':'Contact profile'}</h2><p className="muted">{fa?'شخصی را از فهرست انتخاب کنید یا شخص جدید بسازید.':'Select a contact to inspect its profile, or add a new contact.'}</p></div>}
      </Panel>
    </div>
    <ActionDialog open={confirmArchive} title={selectedNow?.status==='active'?(fa?'بایگانی شخص':'Archive contact'):(fa?'فعال‌سازی شخص':'Restore contact')}
      description={fa?'تراکنش‌های قبلی این شخص حفظ می‌شوند.':'Existing financial records will be preserved.'}
      confirm={fa?'ادامه':'Continue'} destructive={selectedNow?.status==='active'} busy={busy} onConfirm={()=>void updateStatus()} onClose={()=>setConfirmArchive(false)}/>
  </Page>
}
