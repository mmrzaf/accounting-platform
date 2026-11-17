import { useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Icon } from '../components/icons'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { SectionHeading, Status } from '../components/workflow'
import { newRequestKey, today, type List, type StockItem } from '../lib/api'
import { languages } from '../lib/i18n'

type Workspace = 'catalog'|'create'|'movement'
function quantity(value:string,locale:'fa'|'en') {
  const units=BigInt(value)
  const whole=(units/1000n).toLocaleString(locale==='fa'?'fa-IR':'en-US')
  const fraction=(units%1000n).toString().padStart(3,'0')
  return fraction==='000'?whole:`${whole}.${fraction.replace(/0+$/u,'')}`
}
export function Inventory(){
  const {call,locale}=useApplication()
  const fa=locale==='fa'
  const [items,setItems]=useState<StockItem[]>([])
  const [view,setView]=useState<Workspace>('catalog')
  const [query,setQuery]=useState('')
  const [sku,setSku]=useState(''),[name,setName]=useState(''),[unit,setUnit]=useState('pcs')
  const [itemId,setItemId]=useState(''),[direction,setDirection]=useState<'in'|'out'>('in')
  const [amount,setAmount]=useState(''),[date,setDate]=useState(today()),[note,setNote]=useState('')
  const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null)
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const visible=items.filter(item=>`${item.sku} ${item.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  async function reload(){const value=await call<List<StockItem>>('/api/inventory/items');setItems(value.items)}
  useEffect(()=>{let active=true;setLoading(true)
    void call<List<StockItem>>('/api/inventory/items').then(v=>{if(active)setItems(v.items)})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:String(cause))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[call])
  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError(null)
    try{await call('/api/inventory/items',{sku:sku.trim(),name:name.trim(),unit:unit.trim()});setSku('');setName('');await reload();setView('catalog');setNotice(fa?'کالا ایجاد شد.':'Item created.')}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
  }
  async function move(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError(null)
    try{await call(`/api/inventory/items/${itemId}/movements`,{direction,quantity:amount,on:date,note:note.trim(),requestKey:newRequestKey()});setAmount('');setNote('');await reload();setView('catalog');setNotice(fa?'گردش موجودی ثبت شد.':'Stock movement recorded.')}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
  }
  function beginMovement(id=''){setItemId(id);setAmount('');setNote('');setView('movement');setError(null);setNotice(null)}
  return <Page title={languages[locale].inventory}
    description={fa?'فهرست کالاها و ثبت ورود و خروج موجودی':'Catalogue and basic stock movements'}
    actions={<><button type="button" className="secondary" disabled={!items.length} onClick={()=>beginMovement()}><Icon name="refresh" size={17}/>{fa?'ثبت گردش':'Stock movement'}</button>
      <button type="button" onClick={()=>{setView('create');setError(null);setNotice(null)}}><Icon name="plus" size={17}/>{fa?'کالای جدید':'New item'}</button></>}>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <div className="scope-note"><Icon name="inventory" size={18}/><span>{fa?'این بخش فقط مقدار موجودی را نگهداری می‌کند؛ ارزش ریالی، بهای تمام‌شده و ارتباط با فاکتور در این نسخه محاسبه نمی‌شود.':'This is quantity tracking only. Inventory value, cost of goods sold, and invoice integration are not yet supported.'}</span></div>
    {view==='create'&&<Panel><SectionHeading>{fa?'افزودن کالا':'Create item'}</SectionHeading>
      <form className="form-grid" onSubmit={e=>void create(e)}>
        <Field label={fa?'کد کالا (SKU)':'Item code (SKU)'}>{id=><input id={id} dir="ltr" maxLength={80} value={sku} onChange={e=>setSku(e.target.value)} required autoFocus placeholder="PRD-001"/>}</Field>
        <Field label={languages[locale].name}>{id=><input id={id} maxLength={160} value={name} onChange={e=>setName(e.target.value)} required placeholder={fa?'عنوان کالا':'Item name'}/>}</Field>
        <Field label={fa?'واحد اندازه‌گیری':'Unit'}>{id=><input id={id} dir="ltr" value={unit} maxLength={30} onChange={e=>setUnit(e.target.value)} required/>}</Field>
        <div className="form-actions"><button type="button" className="secondary" onClick={()=>setView('catalog')}>{fa?'انصراف':'Cancel'}</button><Submit busy={busy}>{fa?'ایجاد کالا':'Create item'}</Submit></div>
      </form>
    </Panel>}
    {view==='movement'&&<Panel><SectionHeading>{fa?'ثبت ورود یا خروج کالا':'Record stock movement'}</SectionHeading>
      <form className="form-grid" onSubmit={e=>void move(e)}>
        <Field label={fa?'کالا':'Item'}>{id=><select id={id} required value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">{fa?'انتخاب کالا':'Select an item'}</option>{items.filter(x=>x.status==='active').map(item=><option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select>}</Field>
        <Field label={fa?'نوع گردش':'Movement type'}>{id=><select id={id} value={direction} onChange={e=>setDirection(e.target.value as 'in'|'out')}><option value="in">{fa?'ورود به موجودی':'Stock in'}</option><option value="out">{fa?'خروج از موجودی':'Stock out'}</option></select>}</Field>
        <Field label={fa?'مقدار':'Quantity'}>{id=><input id={id} dir="ltr" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/>}</Field>
        <Field label={languages[locale].date}>{id=><input id={id} type="date" dir="ltr" required value={date} onChange={e=>setDate(e.target.value)}/>}</Field>
        <Field label={fa?'شرح گردش':'Reason'}>{id=><input id={id} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} required placeholder={fa?'دلیل ورود یا خروج':'Reason for movement'}/>}</Field>
        <div className="form-actions"><button type="button" className="secondary" onClick={()=>setView('catalog')}>{fa?'انصراف':'Cancel'}</button><Submit busy={busy}>{fa?'ثبت گردش':'Record movement'}</Submit></div>
      </form>
    </Panel>}
    <Panel><SectionHeading actions={<span className="record-count">{items.length.toLocaleString(fa?'fa-IR':'en-US')} {fa?'کالا':'items'}</span>}>{fa?'فهرست کالا':'Item catalogue'}</SectionHeading>
      <div className="register-tools"><label className="sr-only" htmlFor="stock-search">{fa?'جست‌وجوی کالا':'Search items'}</label>
        <input id="stock-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={fa?'جست‌وجو بر اساس نام یا کد…':'Search name or code…'}/></div>
      {loading?<Spinner/>:visible.length===0?(items.length===0?<div className="empty-workspace"><span className="empty-workspace-symbol"><Icon name="inventory" size={27}/></span><h3>{fa?'هنوز کالایی ثبت نشده است':'No items yet'}</h3>
        <p>{fa?'برای شروع، اولین کالا را به فهرست اضافه کنید.':'Create your first catalogue item to begin tracking quantities.'}</p>
        <button type="button" onClick={()=>setView('create')}><Icon name="plus" size={16}/>{fa?'افزودن کالا':'Add an item'}</button></div>:<Empty message={fa?'کالایی با این جست‌وجو پیدا نشد.':'No matching items.'}/>):
        <div className="table-wrap"><table><thead><tr><th>{fa?'کد':'Code'}</th><th>{fa?'عنوان کالا':'Item'}</th><th>{fa?'واحد':'Unit'}</th><th className="numeric">{fa?'موجودی':'Quantity'}</th><th>{fa?'وضعیت':'Status'}</th><th>{fa?'عملیات':'Action'}</th></tr></thead><tbody>
          {visible.map(item=><tr key={item.id}><td dir="ltr">{item.sku}</td><td><strong>{item.name}</strong></td><td>{item.unit}</td>
            <td className="numeric">{quantity(item.quantityMilli,locale)}</td><td><Status value={item.status}/></td>
            <td><button className="text-button" type="button" disabled={item.status!=='active'} onClick={()=>beginMovement(item.id)}>{fa?'ثبت گردش':'Record movement'}</button></td></tr>)}
        </tbody></table></div>}
    </Panel>
  </Page>
}
