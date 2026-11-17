import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { newRequestKey, type Contact, type List } from '../lib/api'
import { languages } from '../lib/i18n'

export function Contacts() {
  const { call, companyId, locale } = useApplication()
  const [items, setItems] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string|null>(null)
  const [notice, setNotice] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  async function reload() { const data = await call<List<Contact>>('/api/business/contacts'); setItems(data.items) }
  useEffect(() => { let active = true; setLoading(true); setItems([])
    void call<List<Contact>>('/api/business/contacts').then(data => { if (active) setItems(data.items) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId, call])
  const visible = useMemo(() => items.filter(item => `${item.displayName} ${item.code ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [items, search])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null); setBusy(true)
    try { await call('/api/business/contacts', { displayName: name, ...(code ? { code } : {}), requestKey: newRequestKey() });
      setName(''); setCode(''); setNotice(languages[locale].success); await reload() }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <Page title={languages[locale].contacts} description={locale === 'fa' ? 'هر شخص می‌تواند هم مشتری و هم تأمین‌کننده باشد.' : 'A contact can be both a customer and a supplier.'}>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <Panel title={locale === 'fa' ? 'شخص جدید' : 'Add contact'}><form className="form-grid" onSubmit={e => void create(e)}>
      <Field label={languages[locale].name}>{id => <input id={id} value={name} maxLength={160} onChange={e => setName(e.target.value)} required/>}</Field>
      <Field label={locale === 'fa' ? 'کد (اختیاری)' : 'Code (optional)'}>{id => <input id={id} dir="ltr" value={code} onChange={e => setCode(e.target.value)}/>}</Field>
      <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
    </form></Panel>
    <Panel title={locale === 'fa' ? 'فهرست اشخاص' : 'Contact directory'}>
      <div className="toolbar"><input aria-label={languages[locale].search} placeholder={languages[locale].search} value={search} onChange={e => setSearch(e.target.value)}/>
        <button className="secondary" onClick={() => void reload().catch(e => setError(String(e)))}>{languages[locale].refresh}</button></div>
      {loading ? <Spinner/> : visible.length === 0 ? <Empty/> : <div className="table-wrap"><table><thead><tr><th>{languages[locale].name}</th><th>{locale === 'fa' ? 'کد' : 'Code'}</th><th>{languages[locale].status}</th></tr></thead>
        <tbody>{visible.map(item => <tr key={item.id}><td>{item.displayName}</td><td dir="ltr">{item.code ?? '—'}</td><td>{item.status}</td></tr>)}</tbody></table></div>}
    </Panel>
  </Page>
}
