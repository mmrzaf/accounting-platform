import type { DatabaseSync } from 'node:sqlite'
import { createIdentityService } from '../identity/service.ts'
import type { Permission } from '../identity/permissions.ts'
import { createTradingService } from '../trading/service.ts'
import { createAccountingService } from '../accounting/service.ts'
import type { ItemKind, PaymentKind, InvoiceLineInput } from '../trading/types.ts'
import { aiError } from './errors.ts'
import { fields, stringField, optionalString } from './validation.ts'
import type { ToolDefinition } from './provider.ts'

export type ToolName = 'list_contacts' | 'get_contact' | 'list_accounts' | 'financial_summary' | 'trial_balance' | 'general_ledger' | 'list_invoices' | 'get_invoice' | 'list_payments' | 'get_payment' |
  'create_contact' | 'create_invoice' | 'post_invoice' | 'create_payment' | 'post_payment' | 'allocate_payment' | 'record_trade' | 'record_settlement'
export type Risk = 'read' | 'draft' | 'post'
export interface ToolDescriptor {
  name: ToolName
  risk: Risk
  description: string
  permissions: readonly Permission[]
  parameters: Record<string, unknown>
}
const str = (description: string) => ({ type: 'string', description })
const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object', properties, required, additionalProperties: false,
})
export const TOOL_CATALOG: readonly ToolDescriptor[] = [
  { name: 'list_contacts', risk: 'read', description: 'Search existing company contacts by name or contact code. Use this before choosing a partyId; ask if several people match.', permissions: ['contacts.read'], parameters: obj({ query: str('Optional name or code fragment') }) },
  { name: 'get_contact', risk: 'read', description: 'Inspect one existing company contact by ID. Use for the contact currently open on screen.', permissions: ['contacts.read'], parameters: obj({ contactId: str('Contact UUID') }, ['contactId']) },
  { name: 'list_accounts', risk: 'read', description: 'Find active company accounting accounts by name or code. Use for a bank account when the user specifies a bank.', permissions: ['accounting.read'], parameters: obj({ query: str('Optional account name or code fragment') }) },
  { name: 'financial_summary', risk: 'read', description: 'Read current assets, liabilities, equity, revenue, expenses and profit derived from the posted ledger.', permissions: ['accounting.read'], parameters: obj({ through: str('Optional YYYY-MM-DD cutoff date') }) },
  { name: 'trial_balance', risk: 'read', description: 'Read exact ledger-derived account balances and trial balance totals for this company.', permissions: ['accounting.read'], parameters: obj({ through: str('Optional YYYY-MM-DD through date') }) },
  { name: 'general_ledger', risk: 'read', description: 'Inspect up to 50 entries and running balances on an account.', permissions: ['accounting.read'], parameters: obj({ accountId: str('Account UUID'), from: str('Optional YYYY-MM-DD start'), through: str('Optional YYYY-MM-DD end') }, ['accountId']) },
  { name: 'list_invoices', risk: 'read', description: 'List sale or purchase invoices for this company.', permissions: ['company.read'], parameters: obj({ kind: { type: 'string', enum: ['sale', 'purchase'] } }, ['kind']) },
  { name: 'get_invoice', risk: 'read', description: 'Inspect an invoice by ID, including outstanding amount.', permissions: ['company.read'], parameters: obj({ invoiceId: str('UUID of invoice') }, ['invoiceId']) },
  { name: 'get_payment', risk: 'read', description: 'Inspect the recorded receipt/payment currently open or referenced in an earlier turn.', permissions: ['payments.read'], parameters: obj({ paymentId: str('Payment UUID') }, ['paymentId']) },
  { name: 'list_payments', risk: 'read', description: 'List receipts and payments, including unallocated amounts.', permissions: ['payments.read'], parameters: obj({}) },
  { name: 'create_contact', risk: 'draft', description: 'Create an company contact.', permissions: ['ai.execute', 'contacts.manage'], parameters: obj({ displayName: str('Contact name'), code: str('Optional contact code') }, ['displayName']) },
  { name: 'create_invoice', risk: 'draft', description: 'Create a DRAFT sale or purchase invoice, not posted to ledger. Amounts MUST be in base-currency minor units.', permissions: ['ai.execute'], parameters: obj({
    kind: { type: 'string', enum: ['sale', 'purchase'] }, partyId: str('Contact UUID'), issuedOn: str('ISO YYYY-MM-DD'),
    controlAccountId: str('Receivable asset for sale or payable liability for purchase'), description: str('Document description'),
    lines: { type: 'array', minItems: 1, maxItems: 100, items: obj({ itemKind: { type: 'string', enum: ['service', 'non_stock', 'good'] }, description: str('Line description'),
      quantity: str('Positive decimal quantity, max three decimals'), unitPriceMinor: str('Positive decimal integer in base currency minor units'),
      accountId: str('Revenue account for sale, expense account for purchase') }, ['itemKind','description','quantity','unitPriceMinor','accountId']) },
  }, ['kind','partyId','issuedOn','controlAccountId','description','lines']) },
  { name: 'post_invoice', risk: 'post', description: 'POST an existing draft invoice to the immutable ledger.', permissions: ['ai.execute','accounting.post','company.read'], parameters: obj({ invoiceId: str('Draft invoice UUID') }, ['invoiceId']) },
  { name: 'create_payment', risk: 'draft', description: 'Record a DRAFT receipt/payment in accounting app. This does NOT transfer money at a bank.', permissions: ['ai.execute','payments.manage'], parameters: obj({
    kind: { type: 'string', enum: ['receipt','payment'] }, partyId: str('Contact UUID'), paidOn: str('ISO YYYY-MM-DD'),
    controlAccountId: str('Receivable/payable account UUID'), bankAccountId: str('Bank/cash asset account UUID'),
    amountMinor: str('Positive base-currency minor-unit integer'), description: str('Description'), reference: str('Optional reference'),
  }, ['kind','partyId','paidOn','controlAccountId','bankAccountId','amountMinor','description']) },
  { name: 'post_payment', risk: 'post', description: 'POST a draft recorded receipt/payment. This does not move real-world money.', permissions: ['ai.execute','payments.manage','accounting.post'], parameters: obj({ paymentId: str('Draft payment UUID') }, ['paymentId']) },
  { name: 'allocate_payment', risk: 'post', description: 'Allocate a posted receipt/payment to a posted invoice, in company base minor units.', permissions: ['ai.execute','payments.manage'], parameters: obj({ paymentId: str('Posted payment UUID'), invoiceId: str('Posted invoice UUID'), amountMinor: str('Positive minor unit integer') }, ['paymentId','invoiceId','amountMinor']) },
  { name: 'record_trade', risk: 'post', description: 'Create and post a purchase or sale and optionally record and allocate a partial payment ATOMICALLY. Uses company posting defaults; do not ask for ledger account IDs. Amounts in exact base currency minor units. Records existing business events, NOT a bank transfer. For payment supply paidMinor and paidOn; bankAccountId is optional and defaults to company cash account.', permissions: ['ai.execute','accounting.post'], parameters: obj({
    kind: { type: 'string', enum: ['sale','purchase'] }, partyId: str('Existing contact UUID, resolved with list_contacts'),
    issuedOn: str('YYYY-MM-DD invoice date'), description: str('Plain-language document description'),
    lines: { type: 'array', minItems: 1, maxItems: 50, items: obj({
      itemKind: { type:'string', enum: ['service','non_stock'] }, description: str('Line description'),
      quantity: str('Positive decimal quantity, at most 3 decimals'), unitPriceMinor: str('Exact positive base-currency minor unit integer')
    }, ['itemKind','description','quantity','unitPriceMinor']) },
    expectedTotalMinor: str('Expected complete invoice total in base-currency minor units. Include when the user specified a total; server rejects a mismatch.'),
    paidMinor: str('Optional immediate payment amount in exact minor units, no more than invoice total'),
    paidOn: str('Required YYYY-MM-DD date if paidMinor present'), bankAccountId: str('Optional bank/cash account UUID from list_accounts')
  }, ['kind','partyId','issuedOn','description','lines']) },
  { name: 'record_settlement', risk: 'post', description: 'Record a receipt/payment and optionally allocate it to an existing posted invoice atomically. Records an EXISTING payment only; never transfers money. Uses configured accounts. To allocate, provide invoiceId; must match contact and direction. Amounts in base-currency minor units.', permissions: ['ai.execute','payments.manage','accounting.post'], parameters: obj({
    kind: { type:'string', enum:['receipt','payment'] }, partyId: str('Existing contact UUID'), paidOn: str('YYYY-MM-DD'),
    amountMinor: str('Exact positive minor-unit integer'), description: str('Payment description'),
    invoiceId: str('Optional posted invoice UUID; allocate up to payment amount and invoice outstanding'),
    bankAccountId: str('Optional cash/bank account UUID')
  }, ['kind','partyId','paidOn','amountMinor','description']) },
]
export const descriptor = (name: string): ToolDescriptor => TOOL_CATALOG.find(tool => tool.name === name) ?? aiError('PROVIDER_RESPONSE_INVALID', 'Provider requested an unknown tool')

/** Strictly validate the entire tool payload BEFORE persisting a proposal.
 * The business service still performs authoritative, database-dependent validation at execution.
 */
export function validateToolArguments(name: string, input: unknown): Record<string, unknown> {
  descriptor(name)
  const shapes: Record<ToolName, { allowed: string[]; required: string[] }> = {
    list_contacts: { allowed: ['query'], required: [] }, get_contact: { allowed: ['contactId'], required: ['contactId'] }, list_accounts: { allowed: ['query'], required: [] },
    financial_summary: { allowed: ['through'], required: [] },
    trial_balance: { allowed: ['through'], required: [] }, general_ledger: { allowed: ['accountId','from','through'], required: ['accountId'] },
    list_invoices: { allowed: ['kind'], required: ['kind'] }, get_invoice: { allowed: ['invoiceId'], required: ['invoiceId'] },
    list_payments: { allowed: [], required: [] }, get_payment: { allowed: ['paymentId'], required: ['paymentId'] }, create_contact: { allowed: ['displayName','code'], required: ['displayName'] },
    create_invoice: { allowed: ['kind','partyId','issuedOn','controlAccountId','description','lines'], required: ['kind','partyId','issuedOn','controlAccountId','description','lines'] },
    post_invoice: { allowed: ['invoiceId'], required: ['invoiceId'] },
    create_payment: { allowed: ['kind','partyId','paidOn','controlAccountId','bankAccountId','amountMinor','description','reference'],
      required: ['kind','partyId','paidOn','controlAccountId','bankAccountId','amountMinor','description'] },
    post_payment: { allowed: ['paymentId'], required: ['paymentId'] },
    allocate_payment: { allowed: ['paymentId','invoiceId','amountMinor'], required: ['paymentId','invoiceId','amountMinor'] },
    record_trade: { allowed: ['kind','partyId','issuedOn','description','lines','paidMinor','paidOn','bankAccountId','expectedTotalMinor'], required: ['kind','partyId','issuedOn','description','lines'] },
    record_settlement: { allowed: ['kind','partyId','paidOn','amountMinor','description','invoiceId','bankAccountId'], required: ['kind','partyId','paidOn','amountMinor','description'] },
  }
  const shape = shapes[name as ToolName]
  const v = fields(input, shape.allowed, shape.required)
  const clean: Record<string, unknown> = {}
  for (const [k, raw] of Object.entries(v)) {
    if (k === 'lines') {
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > (name === 'record_trade' ? 50 : 100)) return aiError('PROVIDER_RESPONSE_INVALID','Invalid invoice lines')
      clean[k] = raw.map(line => {
        const simple = name === 'record_trade'
        const entry = fields(line, simple ? ['itemKind','description','quantity','unitPriceMinor'] : ['itemKind','description','quantity','unitPriceMinor','accountId'], simple ? ['itemKind','description','quantity','unitPriceMinor'] : ['itemKind','description','quantity','unitPriceMinor','accountId'])
        const itemKind = simple ? enumValue(entry['itemKind'],['service','non_stock'] as const,'itemKind') : enumValue(entry['itemKind'],['service','non_stock','good'] as const,'itemKind')
        const quantity = stringField(entry['quantity'],'quantity',32)
        if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,3})?$/u.test(quantity) || !/[1-9]/u.test(quantity))
          return aiError('PROVIDER_RESPONSE_INVALID','Invalid invoice quantity')
        const accountId = simple ? undefined : uuidField(entry['accountId'],'accountId')
        return { itemKind, description:stringField(entry['description'],'description'), quantity,
          unitPriceMinor: amountField(entry['unitPriceMinor'],'unitPriceMinor'), ...(accountId ? { accountId } : {}) }
      })
    } else if (k === 'kind') clean[k] = name === 'create_payment' || name === 'record_settlement'
      ? enumValue(raw,['receipt','payment'] as const,'kind') : enumValue(raw,['sale','purchase'] as const,'kind')
    else if (k === 'itemKind') clean[k] = enumValue(raw,['service','non_stock','good'] as const,'itemKind')
    else if (k.endsWith('Id')) clean[k] = uuidField(raw,k)
    else if (k === 'issuedOn' || k === 'paidOn' || k === 'through' || k === 'from') {
      const date = stringField(raw,k,10)
      const [year,month,day] = date.split('-').map(Number)
      const parsed = new Date(0)
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || year === undefined || month === undefined || day === undefined || year < 1 || year > 9999)
        return aiError('PROVIDER_RESPONSE_INVALID',`Invalid ${k}`)
      parsed.setUTCFullYear(year,month-1,day)
      if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth()+1 !== month || parsed.getUTCDate() !== day)
        return aiError('PROVIDER_RESPONSE_INVALID',`Invalid ${k}`)
      clean[k] = date
    } else if (k === 'amountMinor' || k === 'unitPriceMinor' || k === 'paidMinor' || k === 'expectedTotalMinor') clean[k] = amountField(raw,k)
    else clean[k] = stringField(raw,k,k === 'code' ? 64 : k === 'displayName' ? 160 : 500)
  }
  if(name==='record_trade') {
    if((clean['paidMinor']===undefined)!==(clean['paidOn']===undefined))
      return aiError('PROVIDER_RESPONSE_INVALID','A part-paid invoice needs both payment amount and date')
    if(clean['bankAccountId']!==undefined&&clean['paidMinor']===undefined)
      return aiError('PROVIDER_RESPONSE_INVALID','A bank account is only applicable when a payment is recorded')
  }
  return clean
}
function uuidField(value: unknown, field: string): string {
  const valueStr = stringField(value,field,64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(valueStr))
    return aiError('PROVIDER_RESPONSE_INVALID',`Invalid ${field}`)
  return valueStr
}
function amountField(value: unknown, field: string): string {
  const amount = stringField(value,field,32)
  if (!/^[1-9][0-9]*$/u.test(amount) || BigInt(amount) > 9223372036854775807n)
    return aiError('PROVIDER_RESPONSE_INVALID',`Invalid ${field}`)
  return amount
}

export function makeToolExecutor(db: DatabaseSync, clock: () => Date) {
  const identity = createIdentityService(db, { clock })
  const trade = createTradingService(db, { clock })
  const accounting = createAccountingService(db, { clock })
  function postingDefaults(companyId: string) {
    const row = db.prepare('SELECT receivables_id,payables_id,revenue_id,expense_id,cash_id FROM posting_defaults WHERE company_id=?').get(companyId) as
      {receivables_id:string;payables_id:string;revenue_id:string;expense_id:string;cash_id:string}|undefined
    if (!row) return aiError('INVALID_STATE','Configure default posting accounts before recording financial operations')
    return row
  }
  function permitted(sessionToken: string, companyId: string, tool: ToolDescriptor): boolean {
    const scope = { sessionToken, companyId }
    if (!tool.permissions.every(permission => identity.hasPermission({ ...scope, permission }))) return false
    if (tool.name === 'list_invoices' || tool.name === 'get_invoice') return identity.hasPermission({ ...scope, permission: 'sales.read' }) || identity.hasPermission({ ...scope, permission: 'purchasing.read' })
    if (tool.name === 'record_trade') return identity.hasPermission({ ...scope, permission: 'sales.manage' }) || identity.hasPermission({ ...scope, permission: 'purchasing.manage' })
    if (tool.name === 'create_invoice') return identity.hasPermission({ ...scope, permission: 'sales.manage' }) || identity.hasPermission({ ...scope, permission: 'purchasing.manage' })
    if (tool.name === 'post_invoice') return identity.hasPermission({ ...scope, permission: 'sales.manage' }) || identity.hasPermission({ ...scope, permission: 'purchasing.manage' })
    return true
  }
  function available(sessionToken: string, companyId: string): ToolDefinition[] {
    return TOOL_CATALOG.filter(tool => permitted(sessionToken, companyId, tool)).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }))
  }
  function execute(name: string, args: unknown, scope: { sessionToken: string; companyId: string }, requestKey: string): unknown {
    const tool = descriptor(name)
    if (!permitted(scope.sessionToken, scope.companyId, tool)) return aiError('INVALID_STATE', 'Tool is not available for this user')
    if (name === 'list_contacts') { const v=fields(args,['query']);const query=v['query']===undefined?'':stringField(v['query'],'query',100).toLocaleLowerCase();
      const matching=trade.listContacts(scope).filter(contact=>`${contact.displayName} ${contact.code??''}`.toLocaleLowerCase().includes(query));
      return {items:matching.slice(0,25),truncated:matching.length>25} }

    if (name === 'get_contact') { const v=fields(args,['contactId'],['contactId']); return trade.getContact({ ...scope,contactId:uuidField(v['contactId'],'contactId') }) }
    if (name === 'list_accounts') { const v=fields(args,['query']);const query=v['query']===undefined?'':stringField(v['query'],'query',100).toLocaleLowerCase();
      const matching=accounting.listAccounts(scope).filter(account=>`${account.code} ${account.name}`.toLocaleLowerCase().includes(query));
      return {items:matching.slice(0,50),truncated:matching.length>50} }
    if (name === 'financial_summary') { const v=fields(args,['through']);return accounting.financialSummary({ ...scope,
      ...(v['through']===undefined?{}:{through:stringField(v['through'],'through',10)}) }) }

    if (name === 'trial_balance') {
      const v = fields(args,['through'])
      const report = accounting.trialBalance({ ...scope, ...(v['through'] === undefined ? {} : { through:stringField(v['through'],'through',10) }) })
      return { ...report, rows:report.rows.slice(0,100), truncated:report.rows.length>100 }
    }
    if (name === 'general_ledger') {
      const v = fields(args,['accountId','from','through'],['accountId'])
      return accounting.generalLedger({ ...scope, accountId:stringField(v['accountId'],'accountId'), limit:50,
        ...(v['from'] === undefined ? {} : {from:stringField(v['from'],'from',10)}),
        ...(v['through'] === undefined ? {} : {through:stringField(v['through'],'through',10)}) })
    }
    if (name === 'list_invoices') {
      const v = fields(args, ['kind'], ['kind']), kind = enumValue(v['kind'], ['sale','purchase'] as const, 'kind')
      return trade.listInvoices({ ...scope, kind, limit: 30 })
    }
    if (name === 'get_invoice') { const v = fields(args, ['invoiceId'], ['invoiceId']); return trade.getInvoice({ ...scope, invoiceId: stringField(v['invoiceId'], 'invoiceId') }) }
    if (name === 'get_payment') { const v=fields(args,['paymentId'],['paymentId']); return trade.getPayment({ ...scope,paymentId:uuidField(v['paymentId'],'paymentId') }) }
    if (name === 'list_payments') { fields(args, []); return trade.listPayments({ ...scope, limit: 30 }) }
    if (name === 'record_trade') {
      const v = validateToolArguments(name,args)
      const invoiceKind = v['kind'] as 'sale'|'purchase'
      if (!identity.hasPermission({ ...scope, permission: invoiceKind === 'sale' ? 'sales.manage' : 'purchasing.manage' }))
        return aiError('INVALID_STATE','Insufficient permission for this business operation')
      const defaults = postingDefaults(scope.companyId)
      const controlAccountId = invoiceKind === 'sale' ? defaults.receivables_id : defaults.payables_id
      const accountId = invoiceKind === 'sale' ? defaults.revenue_id : defaults.expense_id
      const lines = (v['lines'] as { itemKind: ItemKind; description: string; quantity: string; unitPriceMinor: string }[])
        .map(line => ({ ...line, accountId }))
      const paid = v['paidMinor'] as string | undefined
      if (paid !== undefined && !identity.hasPermission({ ...scope, permission: 'payments.manage' }))
        return aiError('INVALID_STATE','Payment permission required for a part-paid invoice')
      return trade.recordTrade({ ...scope, kind: invoiceKind, partyId:v['partyId'] as string,
        issuedOn:v['issuedOn'] as string, description:v['description'] as string, lines, controlAccountId,
        requestKey, ...(v['expectedTotalMinor']===undefined?{}:{expectedTotalMinor:v['expectedTotalMinor'] as string}), ...(paid === undefined ? {} : { paidMinor:paid,paidOn:v['paidOn'] as string,
          bankAccountId:(v['bankAccountId'] as string | undefined) ?? defaults.cash_id }) })
    }
    if (name === 'record_settlement') {
      const v = validateToolArguments(name,args)
      const kind = v['kind'] as PaymentKind
      const defaults = postingDefaults(scope.companyId)
      const invoiceId = v['invoiceId'] as string | undefined
      let allocationMinor: string | undefined
      if (invoiceId) {
        const invoice = trade.getInvoice({ ...scope,invoiceId })
        if (invoice.status !== 'posted' || invoice.partyId !== v['partyId'] ||
          invoice.kind !== (kind === 'receipt' ? 'sale' : 'purchase'))
          return aiError('INVALID_STATE','The selected invoice cannot be settled by this payment')
        const remaining = BigInt(invoice.outstandingMinor)
        const paid = BigInt(v['amountMinor'] as string)
        if (remaining <= 0n) return aiError('INVALID_STATE','Invoice has no outstanding balance')
        allocationMinor = (paid < remaining ? paid : remaining).toString()
      }
      return trade.recordPayment({ ...scope, kind, partyId:v['partyId'] as string,
        paidOn:v['paidOn'] as string, amountMinor:v['amountMinor'] as string,
        description:v['description'] as string,
        controlAccountId:kind === 'receipt'?defaults.receivables_id:defaults.payables_id,
        bankAccountId:(v['bankAccountId'] as string | undefined) ?? defaults.cash_id,
        requestKey, ...(invoiceId && allocationMinor ? { invoiceId,allocationMinor } : {}) })
    }
    if (name === 'create_contact') {
      const v = fields(args, ['displayName','code'], ['displayName'])
      return trade.createContact({ ...scope, displayName: stringField(v['displayName'], 'displayName', 160),
        ...(v['code'] === undefined ? {} : { code: stringField(v['code'], 'code', 64) }), requestKey })
    }
    if (name === 'create_invoice') {
      const v = fields(args, ['kind','partyId','issuedOn','controlAccountId','description','lines'], ['kind','partyId','issuedOn','controlAccountId','description','lines'])
      const kind = enumValue(v['kind'], ['sale','purchase'] as const, 'kind')
      if (!identity.hasPermission({ ...scope, permission: kind === 'sale' ? 'sales.manage' : 'purchasing.manage' })) return aiError('INVALID_STATE', 'Insufficient permission for invoice kind')
      if (!Array.isArray(v['lines']) || v['lines'].length < 1 || v['lines'].length > 100) return aiError('PROVIDER_RESPONSE_INVALID', 'Invoice requires 1–100 lines')
      const lines: InvoiceLineInput[] = v['lines'].map(line => {
        const l = fields(line, ['itemKind','description','quantity','unitPriceMinor','accountId'], ['itemKind','description','quantity','unitPriceMinor','accountId'])
        return { itemKind: enumValue(l['itemKind'], ['service','non_stock','good'] as const, 'itemKind') as ItemKind,
          description: stringField(l['description'], 'description'), quantity: stringField(l['quantity'], 'quantity', 32),
          unitPriceMinor: stringField(l['unitPriceMinor'], 'unitPriceMinor', 32), accountId: stringField(l['accountId'], 'accountId') }
      })
      return trade.createInvoice({ ...scope, kind, partyId: stringField(v['partyId'],'partyId'), issuedOn: stringField(v['issuedOn'],'issuedOn', 10),
        controlAccountId: stringField(v['controlAccountId'],'controlAccountId'), description: stringField(v['description'],'description'), lines, requestKey })
    }
    if (name === 'post_invoice') {
      const v = fields(args, ['invoiceId'], ['invoiceId'])
      return trade.postInvoice({ ...scope, id: stringField(v['invoiceId'], 'invoiceId') })
    }
    if (name === 'create_payment') {
      const v = fields(args, ['kind','partyId','paidOn','controlAccountId','bankAccountId','amountMinor','description','reference'],
        ['kind','partyId','paidOn','controlAccountId','bankAccountId','amountMinor','description'])
      return trade.createPayment({ ...scope, kind: enumValue(v['kind'], ['receipt','payment'] as const, 'kind') as PaymentKind,
        partyId: stringField(v['partyId'], 'partyId'), paidOn: stringField(v['paidOn'], 'paidOn', 10),
        controlAccountId: stringField(v['controlAccountId'], 'controlAccountId'), bankAccountId: stringField(v['bankAccountId'], 'bankAccountId'),
        amountMinor: stringField(v['amountMinor'], 'amountMinor', 32), description: stringField(v['description'], 'description'),
        ...(optionalString(v['reference'], 'reference', 160) === undefined ? {} : { reference: stringField(v['reference'], 'reference', 160) }), requestKey })
    }
    if (name === 'post_payment') { const v = fields(args, ['paymentId'], ['paymentId']); return trade.postPayment({ ...scope, id: stringField(v['paymentId'], 'paymentId') }) }
    if (name === 'allocate_payment') {
      const v = fields(args, ['paymentId','invoiceId','amountMinor'], ['paymentId','invoiceId','amountMinor'])
      return trade.allocatePayment({ ...scope, paymentId: stringField(v['paymentId'],'paymentId'), invoiceId: stringField(v['invoiceId'],'invoiceId'),
        amountMinor: stringField(v['amountMinor'],'amountMinor', 32), requestKey })
    }
    return aiError('PROVIDER_RESPONSE_INVALID', 'Unrecognized tool')
  }
  return { available, execute, permitted, descriptor }
}
function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return aiError('PROVIDER_RESPONSE_INVALID', `Invalid ${field}`)
  return value as T
}
