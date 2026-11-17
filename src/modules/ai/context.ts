import type { DatabaseSync } from 'node:sqlite'
import { rowAs } from '../../platform/database/rows.ts'
import { createIdentityContext } from '../identity/context.ts'
import type { Actor } from '../identity/types.ts'
import type { Permission } from '../identity/permissions.ts'
import { aiError } from './errors.ts'

export interface AssistantContext {
  page: 'overview'|'contacts'|'invoices'|'payments'|'ledger'|'inventory'|'settings'|'assistant'
  record?: { type: 'contact'|'invoice'|'payment'|'account'; id: string }
}
const pages: AssistantContext['page'][]=['overview','contacts','invoices','payments','ledger','inventory','settings','assistant']
const recordKinds: Record<NonNullable<AssistantContext['record']>['type'],{table:string;permission:Permission}>={
  contact:{table:'contacts',permission:'contacts.read'},
  invoice:{table:'trade_invoices',permission:'company.read'},
  payment:{table:'trade_payments',permission:'payments.read'},
  account:{table:'ledger_accounts',permission:'accounting.read'},
}
/** UI context is an untrusted hint. Verify the record belongs to this company and is readable. */
export function resolveAssistantContext(db:DatabaseSync, actor:Actor, token:string,raw:unknown,clock:()=>Date=()=>new Date()):AssistantContext|null {
  if(raw===undefined||raw===null)return null
  if(typeof raw!=='object'||Array.isArray(raw))return aiError('INVALID_INPUT','Invalid assistant context')
  const context=raw as Record<string,unknown>
  if(Object.keys(context).some(k=>!['page','record'].includes(k))||!pages.includes(context['page'] as AssistantContext['page']))
    return aiError('INVALID_INPUT','Unknown assistant page')
  const page=context['page'] as AssistantContext['page']
  if(context['record']===undefined)return {page}
  const record=context['record']
  if(!record||typeof record!=='object'||Array.isArray(record))return aiError('INVALID_INPUT','Invalid context record')
  const fields=record as Record<string,unknown>
  const kind=fields['type'] as keyof typeof recordKinds
  const spec=recordKinds[kind]
  if(Object.keys(fields).some(k=>!['type','id'].includes(k))||!spec||
    typeof fields['id']!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(fields['id']))
    return aiError('INVALID_INPUT','Invalid context record')
  createIdentityContext(db,clock).requireActor(token,spec.permission,actor.companyId)
  if(!rowAs<{id:string}>(db.prepare(`SELECT id FROM ${spec.table} WHERE company_id=? AND id=?`).get(actor.companyId,fields['id'])))
    return aiError('INVALID_INPUT','Selected record is no longer available')
  if(kind==='invoice') {
    const invoice=rowAs<{kind:'sale'|'purchase'}>(db.prepare('SELECT kind FROM trade_invoices WHERE company_id=? AND id=?').get(actor.companyId,fields['id']))
    createIdentityContext(db,clock).requireActor(token,invoice?.kind==='sale'?'sales.read':'purchasing.read',actor.companyId)
  }
  return {page,record:{type:kind,id:fields['id']}}
}
