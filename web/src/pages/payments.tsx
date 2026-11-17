import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { ActionDialog, FilterTabs, SearchBox, SectionHeading, Status, SummaryValue } from '../components/workflow'
import { ApiError, majorToMinor, money, newRequestKey, today, type Account, type Book, type Contact, type Currency, type Invoice, type List, type Payment, type PostingDefaults } from '../lib/api'

type Kind = 'receipt' | 'payment'
type Filter = 'all' | 'draft' | 'posted'

export function Payments() {
  const { call, locale } = useApplication()
  const fa = locale === 'fa'
  const [kind, setKind] = useState<Kind>('receipt')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list'|'new'|'detail'>('list')
  const [items, setItems] = useState<Payment[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [book, setBook] = useState<Book|null>(null)
  const [defaults, setDefaults] = useState<PostingDefaults|null>(null)
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [partyId, setPartyId] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [allocationInvoice, setAllocationInvoice] = useState('')
  const [allocationAmount, setAllocationAmount] = useState('')
  const [requestKey, setRequestKey] = useState(newRequestKey)
  const [confirm, setConfirm] = useState<'post'|'void'|'reverse'|null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [notice, setNotice] = useState<string|null>(null)
  const decimals = currencies.find(c => c.code === book?.base_currency)?.decimals ?? 0
  const currency = book?.base_currency ?? ''
  const activeContacts = contacts.filter(c => c.status === 'active')
  const selected = items.find(item => item.id === selectedId) ?? null
  const contactName = (id:string) => contacts.find(c=>c.id===id)?.displayName ?? (fa?'شخص نامشخص':'Unknown contact')
  const accountName = (id:string) => accounts.find(a=>a.id===id)?.name ?? '—'
  const controlAccountId = kind === 'receipt' ? defaults?.receivablesId : defaults?.payablesId
  const bankAccounts = accounts.filter(a => a.active && a.postable && a.category === 'asset')
  const openInvoices = invoices.filter(i => i.kind === (kind === 'receipt' ? 'sale':'purchase') && i.status === 'posted' && BigInt(i.outstandingMinor) > 0n)
  const partyInvoices = openInvoices.filter(i => i.partyId === partyId)
  const selectedInvoice = partyInvoices.find(i => i.id === invoiceId)
  const allocationOptions = selected ? openInvoices.filter(i => i.partyId === selected.partyId) : []
  const chosenAllocationInvoice = allocationOptions.find(i => i.id === allocationInvoice)
  const visible = useMemo(() => items.filter(item => item.kind === kind &&
    (filter === 'all' || item.status === filter) &&
    `${item.number ?? ''} ${item.description} ${item.reference ?? ''} ${contactName(item.partyId)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  // Contact directory is loaded with the register; re-filter after its update.
  [items,kind,filter,search,contacts])

  const reload = useCallback(async () => {
    const [payments, directory, chart, saleInvoices, purchaseInvoices, currencyList, accountingBook, mapping] = await Promise.all([
      call<List<Payment>>('/api/business/payments?limit=100'),
      call<List<Contact>>('/api/business/contacts'),
      call<List<Account>>('/api/accounting/accounts').catch(() => ({items:[]})),
      call<List<Invoice>>('/api/business/invoices?kind=sale&limit=100'),
      call<List<Invoice>>('/api/business/invoices?kind=purchase&limit=100'),
      call<List<Currency>>('/api/accounting/currencies').catch(() => ({items:[]})),
      call<Book>('/api/accounting/book').catch(e => {if(e instanceof ApiError && e.status===404)return null;throw e}),
      call<PostingDefaults|null>('/api/accounting/posting-defaults').catch(e => {if(e instanceof ApiError&&e.status===404)return null;throw e}),
    ])
    setItems(payments.items);setContacts(directory.items);setAccounts(chart.items)
    setInvoices([...saleInvoices.items,...purchaseInvoices.items]);setCurrencies(currencyList.items);setBook(accountingBook);setDefaults(mapping)
  },[call])
  useEffect(() => {let active=true;setLoading(true);setError(null)
    void reload().catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[reload])
  useEffect(()=>{setFilter('all');setView('list');setSelectedId('');setInvoiceId('');setAllocationInvoice('')},[kind])
  function startNew() {
    setPartyId('');setBankAccountId(defaults?.cashId??'');setDate(today());setAmount('');setDescription('');setReference('');setInvoiceId('')
    setRequestKey(newRequestKey());setError(null);setNotice(null);setView('new')
  }
  function showDetail(id:string) {setSelectedId(id);setAllocationInvoice('');setAllocationAmount('');setError(null);setView('detail')}
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError(null);setNotice(null)
    try {
      if(!controlAccountId || !bankAccountId) throw Error(fa?'ابتدا حساب‌های پیش‌فرض را تنظیم کنید.':'Configure posting accounts first.')
      const amountMinor = majorToMinor(amount, decimals)
      if(BigInt(amountMinor)<=0n) throw Error(fa?'مبلغ باید بزرگ‌تر از صفر باشد.':'Amount must be positive.')
      const allocation = invoiceId && selectedInvoice ? (BigInt(amountMinor)<BigInt(selectedInvoice.outstandingMinor)?amountMinor:selectedInvoice.outstandingMinor) : null
      const result = await call<{payment:Payment}>('/api/business/payments/record', {
        kind, partyId, paidOn:date, controlAccountId, bankAccountId, amountMinor, description:description.trim(),
        ...(reference.trim()?{reference:reference.trim()}:{}), requestKey,
        ...(allocation ? {invoiceId,allocationMinor:allocation}:{}),
      })
      await reload();setSelectedId(result.payment.id);setView('detail')
      setNotice(fa?'دریافت/پرداخت ثبت شد و تخصیص انتخاب‌شده نیز اعمال شد.':'Payment posted; any selected invoice allocation was applied.')
    } catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  }
  async function allocate(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!selected)return;setBusy(true);setError(null);setNotice(null)
    try {
      const amountMinor = majorToMinor(allocationAmount,decimals)
      if(BigInt(amountMinor)<=0n || BigInt(amountMinor)>BigInt(selected.unallocatedMinor) ||
        !chosenAllocationInvoice || BigInt(amountMinor)>BigInt(chosenAllocationInvoice.outstandingMinor))
        throw Error(fa?'مبلغ از مانده تخصیص‌نیافته یا مانده فاکتور بیشتر است.':'Amount exceeds available payment or invoice balance.')
      await call('/api/business/allocations',{paymentId:selected.id,invoiceId:allocationInvoice,amountMinor,requestKey:newRequestKey()})
      setAllocationInvoice('');setAllocationAmount('');await reload();setNotice(fa?'مبلغ به فاکتور تخصیص یافت.':'Amount allocated to invoice.')
    } catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  }
  async function performAction() {
    if(!selected||!confirm)return
    setBusy(true);setError(null)
    try {
      if(confirm==='reverse') {
        if(!reverseReason.trim())throw Error(fa?'دلیل برگشت لازم است.':'A reversal reason is required.')
        await call(`/api/business/payments/${selected.id}/reverse`,{reversedOn:today(),reason:reverseReason.trim(),requestKey:newRequestKey()})
      } else await call(`/api/business/payments/${selected.id}/${confirm}`,{})
      setConfirm(null);await reload();setNotice(fa?'عملیات انجام شد.':'Operation completed.')
    } catch(cause){setError(cause instanceof Error?cause.message:String(cause));setConfirm(null)}
    finally{setBusy(false)}
  }
  return <Page title={kind==='receipt'?(fa?'دریافت‌ها':'Receipts'):(fa?'پرداخت‌ها':'Payments')}
    description={fa?'ثبت و تسویه دریافت‌ها و پرداخت‌های شرکت':'Record and settle money movements with fewer steps'}
    actions={<button type="button" disabled={!book||!defaults||loading} onClick={startNew}>{kind==='receipt'?(fa?'دریافت جدید':'New receipt'):(fa?'پرداخت جدید':'New payment')}</button>}>
    <div className="workspace-switch"><FilterTabs label={fa?'نوع عملیات':'Type'} value={kind} onChange={setKind} options={[{value:'receipt',label:fa?'دریافت':'Receipts'},{value:'payment',label:fa?'پرداخت':'Payments'}]}/>
      {view!=='list'&&<button type="button" className="secondary small" onClick={()=>{setView('list');setError(null)}}>{fa?'بازگشت به فهرست':'Back to list'}</button>}</div>
    <Alert text={error}/><Alert text={notice} type="success"/>
    {loading?<Spinner/>:!book||!defaults?<div className="setup-notice"><h2>{fa?'پیکربندی حسابداری لازم است':'Accounting setup required'}</h2>
      <p>{fa?'دفتر و حساب‌های پیش‌فرض را تنظیم کنید تا عملیات مالی بدون انتخاب دستی حساب‌ها انجام شود.':'Set up your book and posting defaults to avoid choosing accounting accounts for each payment.'}</p>
      <Link to="/settings" className="inline-action">{fa?'باز کردن تنظیمات':'Open settings'}</Link></div>:null}
    {view==='list'&&<Panel><SectionHeading actions={<span className="muted small-label">{fa?'آخرین ۱۰۰ سند':'Latest 100 records'}</span>}>{fa?'سوابق':'Register'}</SectionHeading>
      <div className="register-tools"><SearchBox value={search} onChange={setSearch} label={fa?'جست‌وجوی دریافت و پرداخت':'Search payments'}/>
        <FilterTabs label={fa?'وضعیت':'Status'} value={filter} onChange={setFilter} options={[{value:'all',label:fa?'همه':'All'},{value:'draft',label:fa?'پیش‌نویس':'Drafts'},{value:'posted',label:fa?'ثبت‌شده':'Posted'}]}/>
        <button type="button" className="secondary small" onClick={()=>void reload().catch(e=>setError(String(e)))}>{fa?'بازخوانی':'Refresh'}</button></div>
      {!loading&&(visible.length===0?<Empty message={fa?'سندی یافت نشد.':'No matching records.'}/>:<div className="table-wrap"><table><thead><tr>
        <th>{fa?'شماره':'Number'}</th><th>{fa?'طرف حساب':'Contact'}</th><th>{fa?'تاریخ':'Date'}</th><th>{fa?'شرح':'Description'}</th><th className="numeric">{fa?'مبلغ':'Amount'}</th><th className="numeric">{fa?'تخصیص‌نیافته':'Unallocated'}</th><th>{fa?'وضعیت':'Status'}</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}>
        <td><button type="button" className="table-link" onClick={()=>showDetail(item.id)}>{item.number??(fa?'پیش‌نویس':'Draft')}</button></td>
        <td>{contactName(item.partyId)}</td><td dir="ltr">{item.paidOn}</td><td className="cell-description">{item.description}</td>
        <td className="numeric">{money(item.amountMinor,decimals,locale)}</td><td className="numeric">{item.status==='posted'?money(item.unallocatedMinor,decimals,locale):'—'}</td>
        <td><Status value={item.status}/></td></tr>)}</tbody></table></div>)}
    </Panel>}
    {view==='new'&&book&&defaults&&<Panel><SectionHeading>{kind==='receipt'?(fa?'ثبت دریافت':'Record receipt'):(fa?'ثبت پرداخت':'Record payment')}</SectionHeading>
      <form className="document-editor" onSubmit={event=>void create(event)}>
        <div className="form-grid">
          <Field label={fa?'طرف حساب':'Contact'}>{id=><select id={id} required value={partyId} onChange={event=>{setPartyId(event.target.value);setInvoiceId('')}}><option value="">{fa?'انتخاب کنید':'Select contact'}</option>{activeContacts.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>}</Field>
          <Field label={fa?'تاریخ':'Date'}>{id=><input id={id} required type="date" dir="ltr" value={date} onChange={event=>setDate(event.target.value)}/>}</Field>
          <Field label={fa?'بانک یا صندوق':'Bank or cash account'}>{id=><select id={id} required value={bankAccountId} onChange={event=>setBankAccountId(event.target.value)}>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>}</Field>
          <Field label={`${fa?'مبلغ':'Amount'} (${currency})`}>{id=><input id={id} required dir="ltr" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="0"/>}</Field>
          <Field label={fa?'شرح':'Description'}>{id=><input id={id} required maxLength={500} value={description} onChange={event=>setDescription(event.target.value)}/>}</Field>
          <Field label={fa?'شماره پیگیری (اختیاری)':'Reference (optional)'}>{id=><input id={id} maxLength={160} value={reference} onChange={event=>setReference(event.target.value)}/>}</Field>
        </div>
        <div className="payment-settlement"><SectionHeading>{fa?'تسویه فاکتور (اختیاری)':'Invoice settlement (optional)'}</SectionHeading>
          <Field label={fa?'فاکتور باز طرف حساب':'Outstanding invoice'}>{id=><select id={id} disabled={!partyId} value={invoiceId} onChange={event=>setInvoiceId(event.target.value)}><option value="">{fa?'بدون تخصیص؛ ثبت به‌عنوان پیش‌پرداخت':'Leave unapplied / advance'}</option>
            {partyInvoices.map(i=><option key={i.id} value={i.id}>{i.number??i.issuedOn} · {money(i.outstandingMinor,decimals,locale,currency)}</option>)}
          </select>}</Field>
          {selectedInvoice&&<p className="muted fine-print">{fa?'به اندازه کمتر از مبلغ پرداخت و مانده فاکتور تخصیص می‌یابد.':'Up to the smaller of this payment and the invoice outstanding will be allocated. Any remainder stays unapplied.'}</p>}
        </div>
        <div className="document-actions"><button className="secondary" type="button" onClick={()=>setView('list')}>{fa?'انصراف':'Cancel'}</button>
          <Submit busy={busy}>{fa?'ثبت قطعی و تسویه':'Record payment'}</Submit></div>
      </form>
    </Panel>}
    {view==='detail'&&selected&&<Panel><SectionHeading actions={<div className="document-actions">
      {selected.status==='draft'&&<><button disabled={busy} onClick={()=>setConfirm('post')}>{fa?'ثبت قطعی':'Post'}</button><button className="secondary" disabled={busy} onClick={()=>setConfirm('void')}>{fa?'ابطال پیش‌نویس':'Void'}</button></>}
      {selected.status==='posted'&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setReverseReason('');setConfirm('reverse')}}>{fa?'برگشت سند':'Reverse'}</button>}</div>}>{selected.number??(fa?'پیش‌نویس':'Draft')} <Status value={selected.status}/></SectionHeading>
      <div className="record-overview"><SummaryValue label={fa?'طرف حساب':'Contact'} value={contactName(selected.partyId)}/>
        <SummaryValue label={fa?'تاریخ':'Date'} value={selected.paidOn}/>
        <SummaryValue label={fa?'مبلغ':'Amount'} value={money(selected.amountMinor,decimals,locale,currency)}/>
        <SummaryValue label={fa?'تخصیص‌نیافته':'Unallocated'} value={money(selected.unallocatedMinor,decimals,locale,currency)}/>
        <SummaryValue label={fa?'حساب بانک/صندوق':'Bank / cash account'} value={accountName(selected.bankAccountId)}/></div>
      <p>{selected.description}</p>
      {selected.status==='posted'&&BigInt(selected.unallocatedMinor)>0n&&<form onSubmit={event=>void allocate(event)} className="payment-settlement">
        <SectionHeading>{fa?'تخصیص مانده دریافت/پرداخت':'Allocate remaining balance'}</SectionHeading>
        <div className="form-grid"><Field label={fa?'فاکتور باز':'Outstanding invoice'}>{id=><select id={id} required value={allocationInvoice} onChange={event=>setAllocationInvoice(event.target.value)}><option value="">{fa?'انتخاب کنید':'Choose invoice'}</option>
          {allocationOptions.map(i=><option key={i.id} value={i.id}>{i.number??i.issuedOn} · {money(i.outstandingMinor,decimals,locale,currency)}</option>)}</select>}</Field>
          <Field label={fa?'مبلغ تخصیص':'Allocation amount'}>{id=><input id={id} required dir="ltr" inputMode="decimal" value={allocationAmount} onChange={event=>setAllocationAmount(event.target.value)}/>}</Field></div>
        <div className="document-actions"><Submit busy={busy}>{fa?'تخصیص':'Allocate'}</Submit></div>
      </form>}
      <p className="muted fine-print">{fa?'این سند به‌صورت قطعی در دفتر کل ثبت شده است. برای اصلاح از برگشت سند استفاده کنید.':'Posted records are immutable; use a reversal for financial corrections.'}</p>
    </Panel>}
    <ActionDialog open={!!confirm} busy={busy} onClose={()=>setConfirm(null)} onConfirm={()=>void performAction()}
      title={confirm==='post'?(fa?'ثبت قطعی':'Post payment'):confirm==='void'?(fa?'ابطال پیش‌نویس':'Void draft'):(fa?'برگشت سند':'Reverse payment')}
      description={fa?'عملیات مالی در سوابق قابل پیگیری خواهد بود.':'The financial action will remain auditable.'}
      confirm={confirm==='post'?(fa?'ثبت قطعی':'Post'):confirm==='void'?(fa?'ابطال':'Void'):(fa?'برگشت':'Reverse')} destructive={confirm!=='post'}>
      {confirm==='reverse'&&<Field label={fa?'دلیل برگشت':'Reason'}>{id=><input id={id} maxLength={500} value={reverseReason} onChange={event=>setReverseReason(event.target.value)}/>}</Field>}
    </ActionDialog>
  </Page>
}
