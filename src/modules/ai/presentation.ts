import type { DatabaseSync } from 'node:sqlite'
import { rowAs } from '../../platform/database/rows.ts'
import { roundRatio } from '../accounting/money.ts'
import { quantityMilli, positiveAmount } from '../trading/validation.ts'
import { aiError } from './errors.ts'

export interface ActionPreview {
  title: string
  description: string
  risk: 'draft'|'financial'
  fields: { label: string; value: string }[]
  lines?: { description: string; quantity: string; unitPriceMinor: string; totalMinor: string }[]
  currency?: string
  decimals?: number
  totalMinor?: string
  paymentMinor?: string
  outstandingMinor?: string
}
export interface BusinessLink { kind: 'invoice'|'payment'|'contact'; id: string; label: string; path: string }
const descriptions: Record<string, string> = {
  create_contact: 'Add a contact to the company directory',
  create_invoice: 'Save an invoice draft without posting to accounting',
  post_invoice: 'Post an existing draft invoice to accounting',
  create_payment: 'Save a payment or receipt draft',
  post_payment: 'Post an existing receipt/payment to accounting',
  allocate_payment: 'Allocate an existing receipt/payment to an invoice',
  record_trade: 'Record an invoice and its optional partial settlement together',
  record_settlement: 'Record a receipt/payment and apply it to an invoice if selected',
}
function contactName(db:DatabaseSync,companyId:string,id:string): string {
  return rowAs<{display_name:string}>(db.prepare('SELECT display_name FROM contacts WHERE company_id=? AND id=?').get(companyId,id))?.display_name
    ?? aiError('INVALID_STATE','Selected contact is no longer available')
}
function book(db:DatabaseSync,companyId:string) {
  return rowAs<{base_currency:string;decimals:number}>(db.prepare(`SELECT b.base_currency,c.decimals FROM accounting_books b
    JOIN accounting_currencies c ON c.company_id=b.company_id AND c.code=b.base_currency WHERE b.company_id=?`).get(companyId))
}
export function buildActionPreview(db:DatabaseSync,companyId:string,name:string,args:Record<string,unknown>):ActionPreview {
  const kind = args['kind'] === 'sale' ? 'sale' : args['kind'] === 'purchase' ? 'purchase' : ''
  const partyId = args['partyId'] as string|undefined
  const contact = partyId ? contactName(db,companyId,partyId) : null
  const currency = book(db,companyId)
  const preview:ActionPreview = {
    title: name==='record_trade' ? (kind==='sale'?'Record sale':'Record purchase') :
      name==='record_settlement' ? (args['kind']==='receipt'?'Record receipt':'Record payment') :
      name==='create_contact' ? 'Create contact' :
      name==='post_invoice' ? 'Post invoice' : name==='post_payment' ? 'Post payment' :
      name==='allocate_payment' ? 'Allocate payment' : name==='create_invoice' ? 'Prepare invoice' :
      name==='create_payment' ? 'Prepare payment' : 'Review operation',
    description:descriptions[name] ?? 'Review this change',
    risk:['create_contact','create_invoice','create_payment'].includes(name)?'draft':'financial',
    fields:[],
    ...(currency ? {currency:currency.base_currency,decimals:currency.decimals}:{}),
  }
  if (contact) preview.fields.push({label:'Contact',value:contact})
  for (const [field,label] of [['issuedOn','Invoice date'],['paidOn','Payment date'],['description','Description']] as const) {
    const value=args[field]
    if (typeof value==='string' && value) preview.fields.push({label,value})
  }
  if (name==='record_trade') {
    const lines=args['lines'] as {description:string;quantity:string;unitPriceMinor:string}[]
    const mapped=lines.map(line=>({description:line.description,quantity:line.quantity,
      unitPriceMinor:line.unitPriceMinor,
      totalMinor:roundRatio(quantityMilli(line.quantity)*positiveAmount(line.unitPriceMinor,'Price'),1000n).toString()}))
    const total=mapped.reduce((sum,line)=>sum+BigInt(line.totalMinor),0n)
    const expected=args['expectedTotalMinor']===undefined?null:positiveAmount(args['expectedTotalMinor'],'Expected total')
    if(expected!==null&&expected!==total)return aiError('INVALID_INPUT','Invoice line totals do not match the stated total')
    const paid=args['paidMinor']===undefined?0n:positiveAmount(args['paidMinor'],'Payment')
    if(paid>total)return aiError('INVALID_INPUT','Payment cannot exceed the invoice total')
    preview.lines=mapped
    preview.totalMinor=total.toString()
    preview.paymentMinor=paid.toString()
    preview.outstandingMinor=(total-paid).toString()
  }
  if (name==='record_settlement' || name==='create_payment' || name==='allocate_payment') {
    const amount=args['amountMinor']
    if (typeof amount==='string') preview.paymentMinor=amount
  }
  if(['record_trade','record_settlement'].includes(name)) {
    const id=(args['bankAccountId'] as string|undefined)??null
    const bank=rowAs<{name:string}>(db.prepare(`SELECT a.name FROM ledger_accounts a
      WHERE a.company_id=? AND a.id=COALESCE(?,(SELECT p.cash_id FROM posting_defaults p WHERE p.company_id=?))`).get(companyId,id,companyId))
    if(bank&&(args['paidMinor']!==undefined||name==='record_settlement'))preview.fields.push({label:'Bank / cash account',value:bank.name})
  }
  if(name==='create_contact') preview.fields.push({label:'Name',value:String(args['displayName']??'')})
  return preview
}
export function businessLinks(name:string,result:unknown):BusinessLink[] {
  if(!result || typeof result!=='object')return []
  const object=result as Record<string,unknown>
  const entries:{kind:BusinessLink['kind'];value:unknown;prefix:string}[]=[
    {kind:'invoice',value:object['invoice']??(name.includes('invoice')?object:null),prefix:'/invoices'},
    {kind:'payment',value:object['payment']??(name.includes('payment')||name==='record_settlement'?object:null),prefix:'/payments'},
    {kind:'contact',value:name==='create_contact'?object:null,prefix:'/contacts'},
  ]
  return entries.flatMap(({kind,value,prefix})=>{
    if(!value||typeof value!=='object')return []
    const record=value as Record<string,unknown>
    return typeof record['id']==='string'?[{kind,id:record['id'],label:typeof record['number']==='string'?record['number']:kind,path:prefix}]:[]
  })
}
