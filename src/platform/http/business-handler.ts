import { randomUUID } from 'node:crypto'
import type { createIdentityService } from '../../modules/identity/service.ts'
import type { createTradingService } from '../../modules/trading/service.ts'
import type { createAccountingService } from '../../modules/accounting/service.ts'
import type { createBusinessReports } from '../../modules/reports/service.ts'
import { IdentityError, unauthenticated } from '../../modules/identity/errors.ts'
import { AccountingError } from '../../modules/accounting/errors.ts'
import { TradeError } from '../../modules/trading/errors.ts'
import type { InvoiceKind, PaymentKind, InvoiceLineInput } from '../../modules/trading/types.ts'
import { response, bearerCookie, assertLocalOrTls, assertSameOrigin, parseJson } from './request-security.ts'

const ID = '[0-9a-f-]{36}'
function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('VALIDATION_FAILED', `${name} is required`)
  return value
}
function invoiceKind(value: unknown): InvoiceKind {
  if (value !== 'sale' && value !== 'purchase') throw new IdentityError('VALIDATION_FAILED', 'Invalid invoice kind')
  return value
}
function paymentKind(value: unknown): PaymentKind {
  if (value !== 'receipt' && value !== 'payment') throw new IdentityError('VALIDATION_FAILED', 'Invalid payment kind')
  return value
}
function optionalLimit(value: string | null): number {
  if (value === null) return 50
  if (!/^\d{1,3}$/u.test(value) || Number(value) < 1 || Number(value) > 100) throw new IdentityError('VALIDATION_FAILED', 'limit must be 1–100')
  return Number(value)
}
function invoiceLines(value: unknown): InvoiceLineInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new IdentityError('VALIDATION_FAILED', 'Invoice must have 1–100 lines')
  return value.map((line: unknown): InvoiceLineInput => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new IdentityError('VALIDATION_FAILED', 'Invalid invoice line')
    const row = line as Record<string, unknown>
    if (row['itemKind'] !== 'service' && row['itemKind'] !== 'non_stock' && row['itemKind'] !== 'good')
      throw new IdentityError('VALIDATION_FAILED', 'Invalid item kind')
    return { itemKind: row['itemKind'], description: required(row['description'], 'description'),
      quantity: required(row['quantity'], 'quantity'), unitPriceMinor: required(row['unitPriceMinor'], 'unitPriceMinor'), accountId: required(row['accountId'], 'accountId') }
  })
}

/** Mountable HTTP boundary. It never reads the database, trusts user-supplied session tokens,
 * or reimplements accounting and company permission rules. */
export function createBusinessHttpHandler(
  identity: ReturnType<typeof createIdentityService>,
  trading: ReturnType<typeof createTradingService>,
  accounting: ReturnType<typeof createAccountingService>,
  reports: ReturnType<typeof createBusinessReports>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID()
    try {
      const url = new URL(request.url)
      const secure = assertLocalOrTls(url)
      const method = request.method.toUpperCase()
      if (method !== 'GET' && method !== 'POST') return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
      if (method !== 'GET') assertSameOrigin(request, url)
      const sessionToken = bearerCookie(request, secure)
      if (!sessionToken) throw unauthenticated()
      const session = identity.me(sessionToken)
      if (method !== 'GET') identity.verifyCsrf(sessionToken, request.headers.get('x-csrf-token'))
      const scope = { sessionToken, companyId: session.company.id }
      if (url.pathname === '/api/business/contacts') {
        if (method === 'GET') return response({ items: trading.listContacts(scope) })
        const body = await parseJson(request)
        return response(trading.createContact({ ...scope, displayName: required(body['displayName'], 'displayName'),
          ...(body['code'] === undefined ? {} : { code: required(body['code'], 'code') }),
          ...(body['requestKey'] === undefined ? {} : { requestKey: required(body['requestKey'], 'requestKey') }) }), 201)
      }
      const contact = new RegExp(`^/api/business/contacts/(${ID})(?:/(rename|status))?$`, 'u').exec(url.pathname)
      if (contact) {
        const id = contact[1]!
        if (method === 'GET' && !contact[2]) return response(trading.getContact({ ...scope, contactId: id }))
        if (method === 'POST' && contact[2] === 'rename') {
          const b = await parseJson(request)
          const revision = b['expectedRevision']
          if (typeof revision !== 'number' || !Number.isSafeInteger(revision)) throw new IdentityError('VALIDATION_FAILED', 'Invalid revision')
          return response(trading.renameContact({ ...scope, contactId: id,
            displayName: required(b['displayName'], 'displayName'), expectedRevision: revision }))
        }
        if (method === 'POST' && contact[2] === 'status') {
          const b = await parseJson(request)
          if (b['status'] !== 'active' && b['status'] !== 'archived') throw new IdentityError('VALIDATION_FAILED', 'Invalid contact status')
          return response(trading.setContactStatus({ ...scope, contactId: id, status: b['status'] }))
        }
      }
      if (url.pathname === '/api/business/accounts' && method === 'GET') return response({ items: accounting.listAccounts(scope) })
      if (url.pathname === '/api/business/invoices/record' && method === 'POST') {
        const b = await parseJson(request)
        return response(trading.recordInvoice({ ...scope, kind: invoiceKind(b['kind']),
          partyId: required(b['partyId'], 'partyId'), issuedOn: required(b['issuedOn'], 'issuedOn'),
          controlAccountId: required(b['controlAccountId'], 'controlAccountId'),
          description: required(b['description'], 'description'),
          requestKey: required(b['requestKey'], 'requestKey'), lines: invoiceLines(b['lines']) }), 201)
      }
      if (url.pathname === '/api/business/invoices') {
        if (method === 'GET') return response({ items: trading.listInvoices({ ...scope, kind: invoiceKind(url.searchParams.get('kind')), limit: optionalLimit(url.searchParams.get('limit')) }) })
        const b = await parseJson(request)
        return response(trading.createInvoice({ ...scope, kind: invoiceKind(b['kind']), partyId: required(b['partyId'], 'partyId'),
          issuedOn: required(b['issuedOn'], 'issuedOn'), controlAccountId: required(b['controlAccountId'], 'controlAccountId'),
          description: required(b['description'], 'description'), requestKey: required(b['requestKey'], 'requestKey'), lines: invoiceLines(b['lines']) }), 201)
      }
      const invoice = new RegExp(`^/api/business/invoices/(${ID})(?:/(post|reverse|revise|void))?$`, 'u').exec(url.pathname)
      if (invoice) {
        const id = invoice[1]!
        if (method === 'GET' && !invoice[2]) return response(trading.getInvoice({ ...scope, invoiceId: id }))
        if (method === 'POST' && invoice[2] === 'revise') {
          const b = await parseJson(request)
          if (typeof b['expectedRevision'] !== 'number' || !Number.isSafeInteger(b['expectedRevision']))
            throw new IdentityError('VALIDATION_FAILED', 'Invalid revision')
          return response(trading.reviseInvoice({ ...scope, invoiceId: id,
            expectedRevision: b['expectedRevision'], kind: invoiceKind(b['kind']),
            partyId: required(b['partyId'], 'partyId'), issuedOn: required(b['issuedOn'], 'issuedOn'),
            controlAccountId: required(b['controlAccountId'], 'controlAccountId'),
            description: required(b['description'], 'description'), lines: invoiceLines(b['lines']) }))
        }
        if (method === 'POST' && invoice[2] === 'void') return response(trading.voidInvoice({ ...scope, id }))
        if (method === 'POST' && invoice[2] === 'post') return response(trading.postInvoice({ ...scope, id }))
        if (method === 'POST' && invoice[2] === 'reverse') {
          const b = await parseJson(request)
          return response(trading.reverseInvoice({ ...scope, id, reversedOn: required(b['reversedOn'], 'reversedOn'),
            reason: required(b['reason'], 'reason'), requestKey: required(b['requestKey'], 'requestKey') }))
        }
      }
      if (url.pathname === '/api/business/payments/record' && method === 'POST') {
        const b = await parseJson(request)
        return response(trading.recordPayment({ ...scope, kind: paymentKind(b['kind']),
          partyId: required(b['partyId'], 'partyId'), paidOn: required(b['paidOn'], 'paidOn'),
          controlAccountId: required(b['controlAccountId'], 'controlAccountId'),
          bankAccountId: required(b['bankAccountId'], 'bankAccountId'),
          amountMinor: required(b['amountMinor'], 'amountMinor'),
          description: required(b['description'], 'description'), requestKey: required(b['requestKey'], 'requestKey'),
          ...(b['reference'] === undefined ? {} : { reference: required(b['reference'], 'reference') }),
          ...(b['invoiceId'] === undefined ? {} : { invoiceId: required(b['invoiceId'], 'invoiceId') }),
          ...(b['allocationMinor'] === undefined ? {} : { allocationMinor: required(b['allocationMinor'], 'allocationMinor') }),
        }), 201)
      }
      if (url.pathname === '/api/business/payments') {
        if (method === 'GET') {
          const kind = url.searchParams.get('kind')
          return response({ items: trading.listPayments({ ...scope, ...(kind ? { kind: paymentKind(kind) } : {}), limit: optionalLimit(url.searchParams.get('limit')) }) })
        }
        const b = await parseJson(request)
        return response(trading.createPayment({ ...scope, kind: paymentKind(b['kind']), partyId: required(b['partyId'], 'partyId'),
          paidOn: required(b['paidOn'], 'paidOn'), controlAccountId: required(b['controlAccountId'], 'controlAccountId'),
          bankAccountId: required(b['bankAccountId'], 'bankAccountId'), amountMinor: required(b['amountMinor'], 'amountMinor'),
          description: required(b['description'], 'description'), requestKey: required(b['requestKey'], 'requestKey'),
          ...(b['reference'] === undefined ? {} : { reference: required(b['reference'], 'reference') }) }), 201)
      }
      const payment = new RegExp(`^/api/business/payments/(${ID})(?:/(post|reverse|void))?$`, 'u').exec(url.pathname)
      if (payment) {
        const id = payment[1]!
        if (method === 'GET' && !payment[2]) return response(trading.getPayment({ ...scope, paymentId: id }))
        if (method === 'POST' && payment[2] === 'void') return response(trading.voidPayment({ ...scope, id }))
        if (method === 'POST' && payment[2] === 'post') return response(trading.postPayment({ ...scope, id }))
        if (method === 'POST' && payment[2] === 'reverse') {
          const b = await parseJson(request)
          return response(trading.reversePayment({ ...scope, id, reversedOn: required(b['reversedOn'], 'reversedOn'),
            reason: required(b['reason'], 'reason'), requestKey: required(b['requestKey'], 'requestKey') }))
        }
      }
      if (url.pathname === '/api/business/allocations') {
        if (method === 'GET') return response({ items: trading.listAllocations({ ...scope,
          ...(url.searchParams.has('invoiceId') ? { invoiceId: required(url.searchParams.get('invoiceId'), 'invoiceId') } : {}),
          ...(url.searchParams.has('paymentId') ? { paymentId: required(url.searchParams.get('paymentId'), 'paymentId') } : {}) }) })
        const b = await parseJson(request)
        return response(trading.allocatePayment({ ...scope, invoiceId: required(b['invoiceId'], 'invoiceId'), paymentId: required(b['paymentId'], 'paymentId'),
          amountMinor: required(b['amountMinor'], 'amountMinor'), requestKey: required(b['requestKey'], 'requestKey') }), 201)
      }
      const allocation = new RegExp(`^/api/business/allocations/(${ID})/reverse$`, 'u').exec(url.pathname)
      if (allocation && method === 'POST') {
        const b = await parseJson(request)
        return response(trading.reverseAllocation({ ...scope, allocationId: allocation[1]!,
          reason: required(b['reason'], 'reason'), requestKey: required(b['requestKey'], 'requestKey') }))
      }
      if (method === 'GET' && url.pathname === '/api/business/reports/aging')
        return response(reports.invoiceAging({ ...scope, kind: invoiceKind(url.searchParams.get('kind')) }))
      if (method === 'GET' && url.pathname === '/api/business/reports/profit-and-loss')
        return response(reports.profitAndLoss({ ...scope, from: required(url.searchParams.get('from'), 'from'), through: required(url.searchParams.get('through'), 'through') }))
      if (method === 'GET' && url.pathname === '/api/business/reports/balance-sheet')
        return response(reports.balanceSheet({ ...scope, ...(url.searchParams.has('through') ? { through: required(url.searchParams.get('through'), 'through') } : {}) }))
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
    } catch (error) {
      const known = error instanceof IdentityError || error instanceof TradeError || error instanceof AccountingError
      const code = known ? error.code : 'INTERNAL_ERROR'
      const status: Record<string, number> = { INVALID_INPUT: 400, VALIDATION_FAILED: 400, NOT_AUTHENTICATED: 401,
        PERMISSION_DENIED: 403, NOT_FOUND: 404, CONFLICT: 409, INVALID_STATE: 409, PERIOD_CLOSED: 409,
        UNBALANCED: 400, AMOUNT_OUT_OF_RANGE: 400, IMMUTABLE: 409 }
      return response({ error: { code, message: known ? error.message : 'Internal server error' }, requestId }, status[code] ?? 500)
    }
  }
}
