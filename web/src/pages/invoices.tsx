import { useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { majorToMinor, money, newRequestKey, today, type Account, type Contact, type Currency, type Book, type Invoice, type List } from '../lib/api'
import { languages } from '../lib/i18n'

type Kind = 'sale'|'purchase'
export function Invoices() {
  const { call, companyId, locale } = useApplication()
  const [kind, setKind] = useState<Kind>('sale')
  const [items, setItems] = useState<Invoice[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [book, setBook] = useState<Book | null>(null)
  const [partyId, setPartyId] = useState('')
  const [controlAccountId, setControlAccountId] = useState('')
  const [lineAccountId, setLineAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [error, setError] = useState<string|null>(null)
  const [notice, setNotice] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const base = currencies.find(c => c.code === book?.base_currency)
  const decimals = base?.decimals ?? 0
  const currency = base?.code ?? book?.base_currency ?? ''
  const refresh = async () => {
    const [a,b,c,d,accountingBook] = await Promise.all([
      call<List<Invoice>>(`/api/business/invoices?kind=${kind}`), call<List<Contact>>('/api/business/contacts'),
      call<List<Account>>('/api/accounting/accounts'), call<List<Currency>>('/api/accounting/currencies'), call<Book>('/api/accounting/book')])
    setItems(a.items); setContacts(b.items); setAccounts(c.items.filter(x => x.active && x.postable)); setCurrencies(d.items); setBook(accountingBook)
  }
  useEffect(() => { let active = true; setLoading(true); setError(null); setItems([])
    void Promise.all([call<List<Invoice>>(`/api/business/invoices?kind=${kind}`),call<List<Contact>>('/api/business/contacts'),
      call<List<Account>>('/api/accounting/accounts'),call<List<Currency>>('/api/accounting/currencies'),call<Book>('/api/accounting/book')])
      .then(([a,b,c,d,accountingBook]) => { if (active) {setItems(a.items);setContacts(b.items);setAccounts(c.items.filter(x=>x.active&&x.postable));setCurrencies(d.items);setBook(accountingBook)} })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId, kind, call])
  const controlAccounts = accounts.filter(a => kind === 'sale' ? a.category === 'asset' : a.category === 'liability')
  const lineAccounts = accounts.filter(a => a.category === (kind === 'sale' ? 'revenue' : 'expense'))
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null)
    try {
      const draft = await call<Invoice>('/api/business/invoices', { kind, partyId, issuedOn: date, controlAccountId,
        description, requestKey: newRequestKey(), lines: [{ itemKind: 'service', description, quantity,
          unitPriceMinor: majorToMinor(unitPrice, base?.decimals ?? 0), accountId: lineAccountId }] })
      setNotice(locale === 'fa' ? `پیش‌نویس ذخیره شد. شناسه: ${draft.id}` : `Draft saved: ${draft.id}`)
      setDescription(''); setUnitPrice('')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  async function post(id: string) {
    if (!window.confirm(locale === 'fa' ? 'این سند به‌صورت قطعی در دفتر کل ثبت شود؟' : 'Post this invoice to the ledger?')) return
    setBusy(true); setError(null)
    try { await call(`/api/business/invoices/${id}/post`, {}); await refresh(); setNotice(languages[locale].success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <Page title={languages[locale].invoices} description={locale === 'fa' ? 'ثبت پیش‌نویس و ثبت قطعی خرید و فروش' : 'Draft and post purchase/sales invoices'}>
    <div className="toolbar"><label htmlFor="invoice-kind">{locale === 'fa' ? 'نوع' : 'Type'}</label>
      <select id="invoice-kind" value={kind} onChange={e => { setKind(e.target.value as Kind); setControlAccountId(''); setLineAccountId('') }}>
        <option value="sale">{locale === 'fa' ? 'فروش' : 'Sales'}</option><option value="purchase">{locale === 'fa' ? 'خرید' : 'Purchases'}</option>
      </select></div>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <Panel title={locale === 'fa' ? 'فاکتور جدید' : 'New invoice'}>
      <form className="form-grid" onSubmit={e => void create(e)}>
        <Field label={locale === 'fa' ? 'شخص طرف حساب' : 'Contact'}>{id => <select id={id} required value={partyId} onChange={e => setPartyId(e.target.value)}>
          <option value="">—</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>}</Field>
        <Field label={languages[locale].date}>{id => <input id={id} type="date" dir="ltr" required value={date} onChange={e => setDate(e.target.value)}/>}</Field>
        <Field label={locale === 'fa' ? 'حساب دریافتنی/پرداختنی' : 'Receivable / payable account'}>{id => <select id={id} value={controlAccountId} onChange={e => setControlAccountId(e.target.value)} required>
          <option value="">—</option>{controlAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>}</Field>
        <Field label={locale === 'fa' ? 'حساب درآمد/هزینه' : 'Revenue / expense account'}>{id => <select id={id} value={lineAccountId} onChange={e => setLineAccountId(e.target.value)} required>
          <option value="">—</option>{lineAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>}</Field>
        <Field label={languages[locale].description}>{id => <input id={id} value={description} onChange={e => setDescription(e.target.value)} required maxLength={500}/>}</Field>
        <Field label={locale === 'fa' ? 'تعداد' : 'Quantity'}>{id => <input id={id} dir="ltr" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} required/>}</Field>
        <Field label={`${locale === 'fa' ? 'قیمت واحد' : 'Unit price'} (${base?.code ?? currency})`}>{id => <input id={id} dir="ltr" inputMode="decimal" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} required/>}</Field>
        <div className="form-actions"><Submit busy={busy}>{locale === 'fa' ? 'ذخیره پیش‌نویس' : 'Save draft'}</Submit></div>
      </form>
      <p className="muted fine-print">{locale === 'fa' ? 'ثبت پیش‌نویس هیچ سند حسابداری ایجاد نمی‌کند. ثبت قطعی فقط با مجوز مناسب انجام می‌شود.' : 'Saving a draft does not post any journal. Posting requires permission.'}</p>
    </Panel>
    <Panel title={locale === 'fa' ? 'سوابق فاکتور' : 'Invoice history'}>
      {loading ? <Spinner/> : items.length === 0 ? <Empty/> : <div className="table-wrap"><table><thead><tr><th>{locale === 'fa' ? 'شماره' : 'Number'}</th><th>{languages[locale].date}</th><th>{languages[locale].description}</th><th>{languages[locale].amount}</th><th>{languages[locale].status}</th><th>{languages[locale].actions}</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}><td dir="ltr">{item.number ?? '—'}</td><td dir="ltr">{item.issuedOn}</td><td>{item.description}</td><td dir="ltr">{money(item.totalMinor, decimals, locale, currency)}</td><td>{item.status}</td>
          <td>{item.status === 'draft' && <button className="secondary small" disabled={busy} onClick={() => void post(item.id)}>{languages[locale].post}</button>}</td></tr>)}</tbody></table></div>}
    </Panel>
  </Page>
}
