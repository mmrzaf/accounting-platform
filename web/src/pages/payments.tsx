import { useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { majorToMinor, money, newRequestKey, today, type Account, type Contact, type Currency, type Book, type Invoice, type List, type Payment } from '../lib/api'
import { languages } from '../lib/i18n'

type Kind = 'receipt'|'payment'
export function Payments() {
  const { call, companyId, locale } = useApplication()
  const [items, setItems] = useState<Payment[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [book, setBook] = useState<Book | null>(null)
  const [kind, setKind] = useState<Kind>('receipt')
  const [partyId, setPartyId] = useState('')
  const [controlAccountId, setControlAccountId] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string|null>(null)
  const [notice, setNotice] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState('')
  const [selectedPayment, setSelectedPayment] = useState('')
  const [allocationAmount, setAllocationAmount] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const base = currencies.find(c => c.code === book?.base_currency)
  const refresh = async () => {
    const [p,c,a,cur,i,accountingBook] = await Promise.all([call<List<Payment>>('/api/business/payments'), call<List<Contact>>('/api/business/contacts'),
      call<List<Account>>('/api/accounting/accounts'), call<List<Currency>>('/api/accounting/currencies'),
      call<List<Invoice>>(`/api/business/invoices?kind=${kind === 'receipt' ? 'sale' : 'purchase'}`),call<Book>('/api/accounting/book')])
    setItems(p.items); setContacts(c.items); setAccounts(a.items.filter(x => x.active && x.postable)); setCurrencies(cur.items); setInvoices(i.items); setBook(accountingBook)
  }
  useEffect(() => { let active = true; setLoading(true); setError(null); setItems([])
    void Promise.all([call<List<Payment>>('/api/business/payments'),call<List<Contact>>('/api/business/contacts'),
      call<List<Account>>('/api/accounting/accounts'),call<List<Currency>>('/api/accounting/currencies'),
      call<List<Invoice>>(`/api/business/invoices?kind=${kind === 'receipt' ? 'sale' : 'purchase'}`),call<Book>('/api/accounting/book')])
      .then(([p,c,a,cur,i,accountingBook])=> { if(active){setItems(p.items);setContacts(c.items);setAccounts(a.items.filter(x=>x.active&&x.postable));setCurrencies(cur.items);setInvoices(i.items);setBook(accountingBook)} })
      .catch(e=> {if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=> {if(active)setLoading(false)})
    return ()=> {active=false}
  }, [companyId, kind, call])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null)
    try { const result = await call<Payment>('/api/business/payments', {kind,partyId,paidOn:date,controlAccountId,bankAccountId,
      amountMinor: majorToMinor(amount, base?.decimals ?? 0), description,requestKey:newRequestKey()})
      setNotice(locale==='fa'?`پیش‌نویس دریافت/پرداخت ذخیره شد: ${result.id}`:`Payment draft saved: ${result.id}`)
      setAmount('');setDescription('');await refresh() }
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  }
  async function post(id:string){
    if(!window.confirm(locale==='fa'?'سند دریافت/پرداخت در دفتر ثبت شود؟':'Post this payment to the ledger?'))return
    setBusy(true);setError(null)
    try{await call(`/api/business/payments/${id}/post`,{});await refresh();setNotice(languages[locale].success)}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  }
  async function allocate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError(null);setNotice(null)
    try{await call('/api/business/allocations',{paymentId:selectedPayment,invoiceId:selectedInvoice,amountMinor:majorToMinor(allocationAmount,base?.decimals??0),requestKey:newRequestKey()});setAllocationAmount('');setNotice(languages[locale].success);await refresh()}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setBusy(false)}
  }
  return <Page title={languages[locale].payments} description={locale==='fa'?'ثبت دریافت و پرداخت و تخصیص به فاکتورهای باز':'Record receipts, payments, and allocations to posted invoices'}>
    <div className="toolbar"><label htmlFor="payment-kind">{locale==='fa'?'نوع عملیات':'Transaction type'}</label><select id="payment-kind" value={kind} onChange={e=>{setKind(e.target.value as Kind);setControlAccountId('');setSelectedInvoice('')}}>
      <option value="receipt">{locale==='fa'?'دریافت':'Receipt'}</option><option value="payment">{locale==='fa'?'پرداخت':'Payment'}</option>
    </select></div>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <Panel title={locale==='fa'?'ثبت سند جدید':'New payment document'}><form className="form-grid" onSubmit={e=>void create(e)}>
      <Field label={locale==='fa'?'طرف حساب':'Contact'}>{id=><select id={id} required value={partyId} onChange={e=>setPartyId(e.target.value)}><option value="">—</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>}</Field>
      <Field label={languages[locale].date}>{id=><input id={id} type="date" dir="ltr" required value={date} onChange={e=>setDate(e.target.value)}/>}</Field>
      <Field label={locale==='fa'?'حساب طرف حساب':'Control account'}>{id=><select id={id} required value={controlAccountId} onChange={e=>setControlAccountId(e.target.value)}><option value="">—</option>{accounts.filter(a=>kind==='receipt'?a.category==='asset':a.category==='liability').map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>}</Field>
      <Field label={locale==='fa'?'حساب بانک یا صندوق':'Bank or cash account'}>{id=><select id={id} required value={bankAccountId} onChange={e=>setBankAccountId(e.target.value)}><option value="">—</option>{accounts.filter(a=>a.category==='asset').map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>}</Field>
      <Field label={`${languages[locale].amount} (${base?.code??''})`}>{id=><input id={id} required dir="ltr" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/>}</Field>
      <Field label={languages[locale].description}>{id=><input id={id} required value={description} onChange={e=>setDescription(e.target.value)} maxLength={500}/>}</Field>
      <div className="form-actions"><Submit busy={busy}>{locale==='fa'?'ذخیره پیش‌نویس':'Save draft'}</Submit></div>
    </form></Panel>
    <Panel title={locale==='fa'?'سوابق دریافت و پرداخت':'Payment history'}>{loading?<Spinner/>:items.length===0?<Empty/>:<div className="table-wrap"><table><thead><tr><th>{languages[locale].date}</th><th>{languages[locale].description}</th><th>{languages[locale].amount}</th><th>{languages[locale].status}</th><th>{languages[locale].actions}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td dir="ltr">{item.paidOn}</td><td>{item.description}</td><td dir="ltr">{money(item.amountMinor,base?.decimals??0,locale,base?.code)}</td><td>{item.status}</td><td>{item.status==='draft'&&<button type="button" className="secondary small" disabled={busy} onClick={()=>void post(item.id)}>{languages[locale].post}</button>}</td></tr>)}</tbody></table></div>}</Panel>
    <Panel title={locale==='fa'?'تخصیص دریافت/پرداخت به فاکتور':'Allocate a payment to an invoice'}>
      <form className="form-grid" onSubmit={e=>void allocate(e)}>
        <Field label={locale==='fa'?'سند ثبت‌شده':'Posted payment'}>{id=><select id={id} required value={selectedPayment} onChange={e=>setSelectedPayment(e.target.value)}><option value="">—</option>{items.filter(p=>p.status==='posted'&&p.kind===kind).map(p=><option key={p.id} value={p.id}>{p.description} · {money(p.amountMinor,base?.decimals??0,locale,base?.code)}</option>)}</select>}</Field>
        <Field label={locale==='fa'?'فاکتور ثبت‌شده':'Posted invoice'}>{id=><select id={id} required value={selectedInvoice} onChange={e=>setSelectedInvoice(e.target.value)}><option value="">—</option>{invoices.filter(i=>i.status==='posted'&&(!selectedPayment||i.partyId===items.find(p=>p.id===selectedPayment)?.partyId)).map(i=><option key={i.id} value={i.id}>{i.number??i.id} · {money(i.totalMinor,base?.decimals??0,locale,base?.code)}</option>)}</select>}</Field>
        <Field label={`${languages[locale].amount} (${base?.code??''})`}>{id=><input id={id} required dir="ltr" inputMode="decimal" value={allocationAmount} onChange={e=>setAllocationAmount(e.target.value)}/>}</Field>
        <div className="form-actions"><Submit busy={busy}>{locale==='fa'?'تخصیص':'Allocate'}</Submit></div>
      </form><p className="muted fine-print">{locale==='fa'?'مانده و شرایط تخصیص توسط سرور اعتبارسنجی می‌شود.':'The server validates outstanding balances and allocation rules.'}</p>
    </Panel>
  </Page>
}
