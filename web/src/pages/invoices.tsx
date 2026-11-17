import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { ActionDialog, FilterTabs, SearchBox, SectionHeading, Status, SummaryValue } from '../components/workflow'
import { ApiError, majorToMinor, money, newRequestKey, today, type Account, type Book, type Contact, type Currency, type Invoice, type List, type PostingDefaults } from '../lib/api'
import { calculatePreview, milliToQuantity, minorToMajor } from '../lib/financial'

type Kind = 'sale' | 'purchase'
type Filter = 'all' | 'draft' | 'posted'
type Line = { key: string; itemKind: 'service'|'non_stock'; description: string; quantity: string; unitPrice: string; accountId: string }
const newLine = (accountId = ''): Line => ({ key: newRequestKey(), itemKind: 'service', description: '', quantity: '1', unitPrice: '', accountId })
function priceDecimals(book: Book | null, currencies: Currency[]) {
  return currencies.find(c => c.code === book?.base_currency)?.decimals ?? 0
}

export function Invoices() {
  const { call, locale } = useApplication()
  const fa = locale === 'fa'
  const formRef = useRef<HTMLFormElement>(null)
  const [kind, setKind] = useState<Kind>('sale')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<Invoice[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [book, setBook] = useState<Book|null>(null)
  const [defaults, setDefaults] = useState<PostingDefaults|null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [notice, setNotice] = useState<string|null>(null)
  const [view, setView] = useState<'list'|'edit'|'detail'>('list')
  const [editing, setEditing] = useState<Invoice|null>(null)
  const [detail, setDetail] = useState<Invoice|null>(null)
  const [partyId, setPartyId] = useState('')
  const [issuedOn, setIssuedOn] = useState(today())
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [draftKey, setDraftKey] = useState(newRequestKey)
  const [confirm, setConfirm] = useState<'post'|'void'|'reverse'|null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const decimals = priceDecimals(book, currencies)
  const currency = book?.base_currency ?? ''
  const activeContacts = contacts.filter(contact => contact.status === 'active')
  const nameFor = (party: string) => contacts.find(contact=>contact.id===party)?.displayName ?? (fa?'شخص نامشخص':'Unknown contact')
  const lineAccount = kind === 'sale' ? defaults?.revenueId : defaults?.expenseId
  const controlAccount = kind === 'sale' ? defaults?.receivablesId : defaults?.payablesId
  const preview = useMemo(()=>calculatePreview(lines, decimals),[lines,decimals])

  const reload = useCallback(async () => {
    const [listing, directory, accountList, moneyList, accountingBook, mapping] = await Promise.all([
      call<List<Invoice>>(`/api/business/invoices?kind=${kind}&limit=100`),
      call<List<Contact>>('/api/business/contacts'),
      call<List<Account>>('/api/accounting/accounts').catch(()=>({items:[]})),
      call<List<Currency>>('/api/accounting/currencies').catch(()=>({items:[]})),
      call<Book>('/api/accounting/book').catch(e => { if (e instanceof ApiError && e.status === 404) return null; throw e }),
      call<PostingDefaults|null>('/api/accounting/posting-defaults').catch(e => {if(e instanceof ApiError&&e.status===404)return null;throw e}),
    ])
    setItems(listing.items); setContacts(directory.items); setAccounts(accountList.items)
    setCurrencies(moneyList.items); setBook(accountingBook); setDefaults(mapping)
  },[call,kind])
  useEffect(()=>{ let current=true;setLoading(true);setError(null)
    void reload().catch(e=>{if(current)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(current)setLoading(false)})
    return ()=>{current=false}
  },[reload])
  useEffect(()=>{setView('list');setEditing(null);setDetail(null);setFilter('all')},[kind])

  const visible = items.filter(invoice => (filter==='all'||invoice.status===filter) &&
    `${invoice.number??''} ${invoice.description} ${nameFor(invoice.partyId)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  function beginNew() {
    setEditing(null);setPartyId('');setIssuedOn(today());setDescription('');setLines([newLine(lineAccount)]);
    setDraftKey(newRequestKey());setView('edit');setError(null);setNotice(null)
  }
  function beginEdit(invoice: Invoice) {
    setEditing(invoice);setPartyId(invoice.partyId);setIssuedOn(invoice.issuedOn);setDescription(invoice.description)
    setLines(invoice.lines.map(l=>({key:l.id,itemKind:l.itemKind==='non_stock'?'non_stock':'service',description:l.description,
      quantity:milliToQuantity(l.quantityMilli),unitPrice:minorToMajor(l.unitPriceMinor,decimals),accountId:l.accountId})))
    setView('edit');setError(null);setNotice(null)
  }
  function setLine(id: string, changes: Partial<Line>) {
    setLines(current=>current.map(line=>line.key===id?{...line,...changes}:line))
  }
  function formPayload() {
    if (!controlAccount || !lineAccount) throw Error(fa?'ابتدا حساب‌های پیش‌فرض را در تنظیمات تعریف کنید.':'Configure posting defaults in Settings first.')
    if (lines.some(l=>!l.description.trim())) throw Error(fa?'شرح همه ردیف‌ها لازم است.':'Every line needs a description.')
    const validated = lines.map(line=>({itemKind:line.itemKind,description:line.description.trim(),quantity:line.quantity,
      unitPriceMinor:majorToMinor(line.unitPrice,decimals),accountId:line.accountId||lineAccount}))
    return {kind,partyId,issuedOn,controlAccountId:controlAccount,description:description.trim(),lines:validated}
  }
  async function save(post = false) {
    setBusy(true);setError(null);setNotice(null)
    try {
      const payload = formPayload()
      let result: Invoice
      if (editing) {
        if (post) throw Error(fa?'ابتدا تغییرات پیش‌نویس را ذخیره کنید.':'Save draft changes before posting.')
        result=await call<Invoice>(`/api/business/invoices/${editing.id}/revise`,{...payload,expectedRevision:editing.revision})
      } else {
        result=await call<Invoice>(post?'/api/business/invoices/record':'/api/business/invoices',{...payload,requestKey:draftKey})
      }
      await reload();setDetail(result);setView('detail');setEditing(null)
      setNotice(post?(fa?'فاکتور در دفتر ثبت شد.':'Invoice posted to the ledger.'):(fa?'پیش‌نویس ذخیره شد.':'Draft saved.'))
    } catch (cause) {setError(cause instanceof Error?cause.message:String(cause))}
    finally {setBusy(false)}
  }
  async function performAction() {
    if (!detail || !confirm) return
    const action = confirm;setBusy(true);setError(null)
    try {
      let result:Invoice
      if (action==='post') result=await call<Invoice>(`/api/business/invoices/${detail.id}/post`,{})
      else if(action==='void') result=await call<Invoice>(`/api/business/invoices/${detail.id}/void`,{})
      else {if(!reverseReason.trim())throw Error(fa?'دلیل برگشت را وارد کنید.':'A reversal reason is required.')
        result=await call<Invoice>(`/api/business/invoices/${detail.id}/reverse`,{reversedOn:today(),reason:reverseReason.trim(),requestKey:newRequestKey()})}
      setConfirm(null);setDetail(result);await reload();setNotice(fa?'عملیات با موفقیت انجام شد.':'Action completed.')
    } catch(cause){setError(cause instanceof Error?cause.message:String(cause));setConfirm(null)}
    finally {setBusy(false)}
  }
  const heading = kind==='sale'?(fa?'فاکتورهای فروش':'Sales invoices'):(fa?'فاکتورهای خرید':'Purchase invoices')
  return <Page title={heading} description={fa?'ثبت، بررسی و پیگیری فاکتورها و مانده‌های تسویه‌نشده':'Create, review, post and track invoices and outstanding balances'}
    actions={<button onClick={beginNew} disabled={!book||!defaults||loading}>{fa?'فاکتور جدید':'New invoice'}</button>}>
    <div className="workspace-switch"><FilterTabs label={fa?'نوع فاکتور':'Invoice type'} value={kind} onChange={setKind} options={[{value:'sale',label:fa?'فروش':'Sales'},{value:'purchase',label:fa?'خرید':'Purchases'}]}/>
      {view!=='list'&&<button className="secondary small" type="button" onClick={()=>{setView('list');setError(null)}}>{fa?'بازگشت به فهرست':'Back to list'}</button>}</div>
    <Alert text={error}/><Alert text={notice} type="success"/>
    {loading?<Spinner/>:!book||!defaults?<div className="setup-notice"><h2>{fa?'تنظیم حسابداری لازم است':'Accounting setup required'}</h2><p>{fa?'پیش از ثبت فاکتور، دفتر حسابداری و حساب‌های پیش‌فرض را تنظیم کنید.':'Set up the accounting book and posting accounts before creating invoices.'}</p><Link className="inline-action" to="/settings">{fa?'رفتن به تنظیمات':'Open settings'}</Link></div>:null}
    {view==='list'&&<Panel><SectionHeading actions={<span className="muted small-label">{fa?'آخرین ۱۰۰ فاکتور':'Latest 100 invoices'}</span>}>{fa?'سوابق فاکتورها':'Invoice register'}</SectionHeading>
      <div className="register-tools"><SearchBox value={search} onChange={setSearch} label={fa?'جست‌وجوی فاکتورها':'Search invoices'} placeholder={fa?'شماره، شخص یا شرح':'Number, contact or description'}/>
        <FilterTabs label={fa?'وضعیت':'Status'} value={filter} onChange={setFilter} options={[{value:'all',label:fa?'همه':'All'},{value:'draft',label:fa?'پیش‌نویس':'Drafts'},{value:'posted',label:fa?'ثبت‌شده':'Posted'}]}/>
        <button type="button" className="secondary small" onClick={()=>void reload().catch(e=>setError(String(e)))}>{fa?'بازخوانی':'Refresh'}</button></div>
      {visible.length===0?<Empty message={fa?'فاکتوری با این مشخصات پیدا نشد.':'No matching invoices.'}/>:<div className="table-wrap"><table><thead><tr><th>{fa?'شماره':'Number'}</th><th>{fa?'شخص':'Contact'}</th><th>{fa?'تاریخ':'Date'}</th><th>{fa?'شرح':'Description'}</th><th className="numeric">{fa?'مبلغ':'Amount'}</th><th className="numeric">{fa?'مانده':'Outstanding'}</th><th>{fa?'وضعیت':'Status'}</th></tr></thead><tbody>
        {visible.map(invoice=><tr key={invoice.id} className="clickable-row"><td><button className="table-link" type="button" onClick={()=>{setDetail(invoice);setView('detail');setError(null)}}>{invoice.number??(fa?'پیش‌نویس':'Draft')}</button></td>
          <td>{nameFor(invoice.partyId)}</td><td dir="ltr">{invoice.issuedOn}</td><td className="cell-description">{invoice.description}</td>
          <td className="numeric">{money(invoice.totalMinor,decimals,locale)}</td><td className="numeric">{invoice.status==='posted'?money(invoice.outstandingMinor,decimals,locale):'—'}</td>
          <td><Status value={invoice.status}/></td></tr>)}</tbody></table></div>}
    </Panel>}
    {view==='edit'&&book&&defaults&&<Panel><SectionHeading>{editing?(fa?'ویرایش پیش‌نویس':'Edit draft'):(fa?'فاکتور جدید':'New invoice')}</SectionHeading>
      <form ref={formRef} onSubmit={event=>{event.preventDefault();void save()}} className="document-editor">
        <div className="document-header form-grid">
          <Field label={fa?'شخص طرف حساب':'Contact'}>{id=><select id={id} value={partyId} onChange={event=>setPartyId(event.target.value)} required><option value="">{fa?'انتخاب کنید':'Choose a contact'}</option>{activeContacts.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>}</Field>
          <Field label={fa?'تاریخ سند':'Document date'}>{id=><input id={id} type="date" dir="ltr" required value={issuedOn} onChange={event=>setIssuedOn(event.target.value)}/>}</Field>
          <Field label={fa?'شرح سند':'Invoice description'}>{id=><input id={id} maxLength={500} required value={description} onChange={event=>setDescription(event.target.value)} placeholder={fa?'شرح کوتاه فاکتور':'Short summary'}/>}</Field>
        </div>
        <SectionHeading actions={<button type="button" className="secondary small" disabled={lines.length>=100} onClick={()=>setLines(current=>[...current,newLine(lineAccount)])}>{fa?'افزودن ردیف':'Add line'}</button>}>{fa?'اقلام فاکتور':'Line items'}</SectionHeading>
        <div className="table-wrap document-line-table"><table><thead><tr><th>#</th><th>{fa?'نوع':'Type'}</th><th>{fa?'شرح کالا/خدمت':'Description'}</th><th className="numeric">{fa?'تعداد':'Quantity'}</th><th className="numeric">{fa?'قیمت واحد':'Unit price'}</th><th className="numeric">{fa?'جمع':'Line total'}</th><th><span className="sr-only">{fa?'حذف':'Remove'}</span></th></tr></thead><tbody>
          {lines.map((line,index)=><tr key={line.key}><td>{index+1}</td><td><select aria-label={fa?'نوع ردیف':'Line type'} value={line.itemKind} onChange={event=>setLine(line.key,{itemKind:event.target.value as Line['itemKind']})}><option value="service">{fa?'خدمت':'Service'}</option><option value="non_stock">{fa?'غیرانبار':'Non-stock'}</option></select></td>
            <td><input aria-label={fa?`شرح ردیف ${index+1}`:`Line ${index+1} description`} required maxLength={500} value={line.description} onChange={event=>setLine(line.key,{description:event.target.value})}/></td>
            <td><input aria-label={fa?'تعداد':'Quantity'} required dir="ltr" inputMode="decimal" value={line.quantity} onChange={event=>setLine(line.key,{quantity:event.target.value})}/></td>
            <td><input aria-label={fa?'قیمت واحد':'Unit price'} required dir="ltr" inputMode="decimal" value={line.unitPrice} onChange={event=>setLine(line.key,{unitPrice:event.target.value})}/></td>
            <td className="numeric">{calculatePreview([line],decimals)===null?'—':money(calculatePreview([line],decimals)!,decimals,locale)}</td>
            <td><button type="button" className="text-button" disabled={lines.length===1} aria-label={fa?`حذف ردیف ${index+1}`:`Remove line ${index+1}`} onClick={()=>setLines(current=>current.filter(l=>l.key!==line.key))}>×</button></td></tr>)}
        </tbody></table></div>
        <details className="advanced-settings"><summary>{fa?'حساب‌های ردیف‌ها (ویژه حسابدار)':'Advanced: posting accounts'}</summary>
          <p className="muted fine-print">{fa?'حساب‌های پیش‌فرض از تنظیمات انتخاب شده‌اند. فقط در صورت نیاز تغییر دهید.':'Accounts are prefilled from company settings. Change only when necessary.'}</p>
          {lines.map((line,index)=><Field key={line.key} label={`${index+1}. ${line.description|| (fa?'ردیف':'Line')}`}>{id=><select id={id} value={line.accountId||lineAccount||''} onChange={event=>setLine(line.key,{accountId:event.target.value})}>{accounts.filter(a=>a.active&&a.postable&&a.category===(kind==='sale'?'revenue':'expense')).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>}</Field>)}
        </details>
        <div className="document-footer"><div className="document-totals"><span className="muted">{fa?'جمع فاکتور':'Invoice total'}</span><strong dir="ltr">{preview===null?'—':money(preview,decimals,locale,currency)}</strong>
          <small className="muted">{fa?'مالیات و تخفیف خودکار در این نسخه اعمال نمی‌شود.':'Automatic tax and discounts are not enabled in this workflow.'}</small></div>
          <div className="document-actions"><button className="secondary" type="button" onClick={()=>setView('list')}>{fa?'انصراف':'Cancel'}</button><Submit busy={busy}>{fa?'ذخیره پیش‌نویس':'Save draft'}</Submit>
            {!editing&&<button type="button" disabled={busy||preview===null||!partyId||!description.trim()} onClick={()=>{if(formRef.current?.reportValidity()) void save(true)}}>{fa?'ثبت قطعی':'Post invoice'}</button>}
          </div>
        </div>
      </form>
    </Panel>}
    {view==='detail'&&detail&&<Panel><SectionHeading actions={<div className="document-actions">
      {detail.status==='draft'&&<><button className="secondary" onClick={()=>beginEdit(detail)}>{fa?'ویرایش':'Edit draft'}</button><button disabled={busy} onClick={()=>setConfirm('post')}>{fa?'ثبت قطعی':'Post invoice'}</button><button className="text-button" disabled={busy} onClick={()=>setConfirm('void')}>{fa?'ابطال پیش‌نویس':'Void draft'}</button></>}
      {detail.status==='posted'&&<button className="secondary small" onClick={()=>{setReverseReason('');setConfirm('reverse')}}>{fa?'برگشت سند':'Reverse document'}</button>}</div>}>{detail.number??(fa?'پیش‌نویس فاکتور':'Draft invoice')} <Status value={detail.status}/></SectionHeading>
      <div className="record-overview"><SummaryValue label={fa?'شخص':'Contact'} value={nameFor(detail.partyId)}/><SummaryValue label={fa?'تاریخ':'Date'} value={detail.issuedOn}/>
        <SummaryValue label={fa?'مبلغ فاکتور':'Invoice amount'} value={money(detail.totalMinor,decimals,locale,currency)}/>
        {detail.status==='posted'&&<SummaryValue label={fa?'مانده تسویه‌نشده':'Outstanding'} value={money(detail.outstandingMinor,decimals,locale,currency)}/>}</div>
      <p>{detail.description}</p><div className="table-wrap"><table><thead><tr><th>{fa?'شرح':'Description'}</th><th className="numeric">{fa?'تعداد':'Quantity'}</th><th className="numeric">{fa?'قیمت واحد':'Unit price'}</th><th className="numeric">{fa?'جمع':'Total'}</th></tr></thead><tbody>
        {detail.lines.map(line=><tr key={line.id}><td>{line.description}</td><td className="numeric">{milliToQuantity(line.quantityMilli)}</td><td className="numeric">{money(line.unitPriceMinor,decimals,locale)}</td><td className="numeric">{money(line.lineTotalMinor,decimals,locale)}</td></tr>)}</tbody></table></div>
      {detail.status==='posted'&&<p className="document-helper">{fa?'این سند در دفتر کل ثبت شده و ویرایش مستقیم آن مجاز نیست. برای اصلاح از برگشت سند یا یادداشت بستانکار استفاده کنید.':'This invoice is posted and cannot be edited. Use reversal or credit-note workflows for corrections.'}</p>}
      {detail.status==='posted'&&<Link to="/payments" className="inline-action">{fa?'ثبت دریافت/پرداخت':'Record a receipt or payment'}</Link>}
    </Panel>}
    <ActionDialog open={confirm!==null} busy={busy} onClose={()=>setConfirm(null)} onConfirm={()=>void performAction()}
      title={confirm==='post'?(fa?'ثبت قطعی فاکتور':'Post invoice'):confirm==='void'?(fa?'ابطال پیش‌نویس':'Void draft'):(fa?'برگشت سند ثبت‌شده':'Reverse posted invoice')}
      description={confirm==='post'?(fa?'پس از ثبت قطعی، سند قابل ویرایش مستقیم نخواهد بود.':'Once posted, this invoice cannot be edited directly.'):
        confirm==='void'?(fa?'این پیش‌نویس دیگر قابل استفاده نخواهد بود.':'This draft will no longer be usable.'):(fa?'برگشت، اثر مالی جدیدی ثبت می‌کند و سابقه اصلی را حفظ می‌کند.':'Reversal posts a new financial entry; the original is preserved.')}
      confirm={confirm==='post'?(fa?'ثبت قطعی':'Post'):confirm==='void'?(fa?'ابطال':'Void'):(fa?'برگشت':'Reverse')} destructive={confirm!=='post'}>
      {confirm==='reverse'&&<Field label={fa?'دلیل برگشت سند':'Reason for reversal'}>{id=><input id={id} maxLength={500} value={reverseReason} onChange={event=>setReverseReason(event.target.value)} placeholder={fa?'دلیل مستند ثبت کنید':'Describe the correction'}/>}</Field>}
    </ActionDialog>
  </Page>
}
