import { useEffect, useState, type FormEvent } from 'react'
import { useApplication } from '../app/context'
import { Alert, Empty, Field, Page, Panel, Spinner, Submit } from '../components/ui'
import { newRequestKey, today, type List, type StockItem } from '../lib/api'
import { languages } from '../lib/i18n'
export function Inventory(){
  const {call,companyId,locale}=useApplication()
  const [items,setItems]=useState<StockItem[]>([])
  const [sku,setSku]=useState(''),[name,setName]=useState(''),[unit,setUnit]=useState('pcs')
  const [itemId,setItemId]=useState(''),[direction,setDirection]=useState<'in'|'out'>('in')
  const [quantity,setQuantity]=useState(''),[date,setDate]=useState(today()),[note,setNote]=useState('')
  const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null)
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  async function reload(){const value=await call<List<StockItem>>('/api/inventory/items');setItems(value.items)}
  useEffect(()=>{let active=true;setLoading(true);setError(null);setItems([])
    void call<List<StockItem>>('/api/inventory/items').then(v=>{if(active)setItems(v.items)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[companyId,call])
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError(null)
    try{await call('/api/inventory/items',{sku,name,unit});setSku('');setName('');await reload();setNotice(languages[locale].success)}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)} }
  async function move(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError(null)
    try{await call(`/api/inventory/items/${itemId}/movements`,{direction,quantity,on:date,note,requestKey:newRequestKey()});setQuantity('');setNote('');await reload();setNotice(languages[locale].success)}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)} }
  return <Page title={languages[locale].inventory} description={locale==='fa'?'فقط شمارش مقدار کالا؛ ارزش‌گذاری موجودی و بهای تمام‌شده هنوز پشتیبانی نمی‌شود.':'Quantity-only stock. Financial valuation and cost of goods sold are not yet supported.'}>
    <Alert text={error}/><Alert text={notice} type="success"/>
    <Panel title={locale==='fa'?'کالای جدید':'New item'}><form className="form-grid" onSubmit={e=>void create(e)}>
      <Field label="SKU">{id=><input id={id} dir="ltr" value={sku} onChange={e=>setSku(e.target.value)} required/>}</Field>
      <Field label={languages[locale].name}>{id=><input id={id} value={name} onChange={e=>setName(e.target.value)} required/>}</Field>
      <Field label={locale==='fa'?'واحد':'Unit'}>{id=><input id={id} dir="ltr" value={unit} onChange={e=>setUnit(e.target.value)} required/>}</Field>
      <div className="form-actions"><Submit busy={busy}>{languages[locale].create}</Submit></div>
    </form></Panel>
    <Panel title={locale==='fa'?'تغییر موجودی':'Stock adjustment'}><form className="form-grid" onSubmit={e=>void move(e)}>
      <Field label={locale==='fa'?'کالا':'Item'}>{id=><select id={id} required value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">—</option>{items.filter(x=>x.status==='active').map(item=><option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>}</Field>
      <Field label={locale==='fa'?'نوع':'Direction'}>{id=><select id={id} value={direction} onChange={e=>setDirection(e.target.value as 'in'|'out')}><option value="in">{locale==='fa'?'ورود':'In'}</option><option value="out">{locale==='fa'?'خروج':'Out'}</option></select>}</Field>
      <Field label={locale==='fa'?'تعداد':'Quantity'}>{id=><input id={id} dir="ltr" value={quantity} onChange={e=>setQuantity(e.target.value)} inputMode="decimal" required/>}</Field>
      <Field label={languages[locale].date}>{id=><input id={id} type="date" dir="ltr" value={date} onChange={e=>setDate(e.target.value)} required/>}</Field>
      <Field label={languages[locale].description}>{id=><input id={id} value={note} onChange={e=>setNote(e.target.value)} required/>}</Field>
      <div className="form-actions"><Submit busy={busy}>{languages[locale].save}</Submit></div>
    </form></Panel>
    <Panel title={locale==='fa'?'کالاها':'Items'}>{loading?<Spinner/>:items.length===0?<Empty/>:<div className="table-wrap"><table><thead><tr><th>SKU</th><th>{languages[locale].name}</th><th>{locale==='fa'?'واحد':'Unit'}</th><th>{locale==='fa'?'موجودی':'Quantity'}</th><th>{languages[locale].status}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td dir="ltr">{item.sku}</td><td>{item.name}</td><td>{item.unit}</td><td dir="ltr">{(BigInt(item.quantityMilli)/1000n).toString()}.{(BigInt(item.quantityMilli)%1000n).toString().padStart(3,'0')}</td><td>{item.status}</td></tr>)}</tbody></table></div>}</Panel>
  </Page>
}
