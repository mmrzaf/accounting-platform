import { randomUUID } from 'node:crypto'
import type { createIdentityService } from '../../modules/identity/service.ts'
import type { createInventoryService } from '../../modules/inventory/service.ts'
import type { createTaxService } from '../../modules/tax/service.ts'
import type { createDocumentService } from '../../modules/documents/service.ts'
import type { createContactImportService } from '../../modules/imports/contacts.ts'
import type { createTradingService } from '../../modules/trading/service.ts'
import { IdentityError, unauthenticated } from '../../modules/identity/errors.ts'
import { TradeError } from '../../modules/trading/errors.ts'
import { AccountingError } from '../../modules/accounting/errors.ts'
import { assertLocalOrTls, assertSameOrigin, bearerCookie, parseJson, response } from './request-security.ts'

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('VALIDATION_FAILED', `${name} is required`)
  return value
}
function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new IdentityError('VALIDATION_FAILED', `${name} must be an integer`)
  return value
}
function bool(value: unknown, name: string) {
  if (typeof value !== 'boolean') throw new IdentityError('VALIDATION_FAILED', `${name} must be a boolean`)
  return value
}
function direction(value: unknown): 'in' | 'out' {
  if (value !== 'in' && value !== 'out') throw new IdentityError('VALIDATION_FAILED', 'Invalid stock direction')
  return value
}
function subject(value: unknown): 'invoice' | 'payment' | 'contact' | 'journal' {
  if (value !== 'invoice' && value !== 'payment' && value !== 'contact' && value !== 'journal')
    throw new IdentityError('VALIDATION_FAILED', 'Invalid document subject type')
  return value
}
const ID = '[0-9a-f-]{36}'
const binaryLimit = 10 * 1024 * 1024
/** Authorize before invoking any of the existing company-scoped services. */
export function createExtensionsHttpHandler(
  identity: ReturnType<typeof createIdentityService>,
  trading: ReturnType<typeof createTradingService>,
  inventory: ReturnType<typeof createInventoryService>,
  tax: ReturnType<typeof createTaxService>,
  imports: ReturnType<typeof createContactImportService>,
  documents: ReturnType<typeof createDocumentService>,
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
      const path = url.pathname
      const body = () => parseJson(request, path === '/api/imports/contacts' ? 2 * 1024 * 1024 : undefined)
      if (path === '/api/inventory/items') {
        if (method === 'GET') return response({ items: inventory.listItems(scope) })
        const b = await body()
        return response(inventory.createItem({ ...scope, sku: required(b['sku'], 'sku'),
          name: required(b['name'], 'name'), unit: required(b['unit'], 'unit') }), 201)
      }
      const item = new RegExp(`^/api/inventory/items/(${ID})(?:/(status|movements))?$`, 'u').exec(path)
      if (item) {
        const itemId = item[1]!
        if (method === 'GET' && !item[2]) return response(inventory.getItem({ ...scope, itemId }))
        if (method === 'POST' && item[2] === 'status') {
          const b = await body()
          if (b['status'] !== 'active' && b['status'] !== 'archived') throw new IdentityError('VALIDATION_FAILED', 'Invalid item status')
          return response(inventory.setItemStatus({ ...scope, itemId, status: b['status'] }))
        }
        if (item[2] === 'movements') {
          if (method === 'GET') return response({ items: inventory.listMovements({ ...scope, itemId }) })
          const b = await body()
          return response(inventory.move({ ...scope, itemId, direction: direction(b['direction']),
            quantity: required(b['quantity'], 'quantity'), on: required(b['on'], 'on'),
            note: required(b['note'], 'note'), requestKey: required(b['requestKey'], 'requestKey') }), 201)
        }
      }
      if (path === '/api/tax/codes') {
        if (method === 'GET') return response({ items: tax.list({ ...scope,
          ...(url.searchParams.has('code') ? { code: required(url.searchParams.get('code'), 'code') } : {}) }) })
        const b = await body()
        return response(tax.configure({ ...scope, code: required(b['code'], 'code'), name: required(b['name'], 'name'),
          effectiveOn: required(b['effectiveOn'], 'effectiveOn'), ratePpm: integer(b['ratePpm'], 'ratePpm') }), 201)
      }
      if (method === 'GET' && path === '/api/tax/quote')
        return response(tax.quote({ ...scope, code: required(url.searchParams.get('code'), 'code'),
          on: required(url.searchParams.get('on'), 'on'), amountMinor: required(url.searchParams.get('amountMinor'), 'amountMinor') }))
      if (method === 'POST' && path === '/api/imports/contacts') {
        const b = await body()
        return response(imports.importContacts({ ...scope, csv: required(b['csv'], 'csv'),
          batchKey: required(b['batchKey'], 'batchKey'),
          ...(b['dryRun'] === undefined ? {} : { dryRun: bool(b['dryRun'], 'dryRun') }) }), 201)
      }
      if (path === '/api/credit-notes') {
        if (method === 'GET') return response({ items: trading.listCreditNotes({ ...scope, invoiceId: required(url.searchParams.get('invoiceId'), 'invoiceId') }) })
        const b = await body()
        return response(trading.createCreditNote({ ...scope, invoiceId: required(b['invoiceId'], 'invoiceId'),
          invoiceLineId: required(b['invoiceLineId'], 'invoiceLineId'), creditedOn: required(b['creditedOn'], 'creditedOn'),
          amountMinor: required(b['amountMinor'], 'amountMinor'), reason: required(b['reason'], 'reason'),
          requestKey: required(b['requestKey'], 'requestKey') }), 201)
      }
      const credit = new RegExp(`^/api/credit-notes/(${ID})(?:/(post|reverse|void))?$`, 'u').exec(path)
      if (credit) {
        const creditNoteId = credit[1]!
        if (method === 'GET' && !credit[2]) return response(trading.getCreditNote({ ...scope, creditNoteId }))
        if (method === 'POST' && credit[2] === 'post') return response(trading.postCreditNote({ ...scope, creditNoteId }))
        if (method === 'POST' && credit[2] === 'void') return response(trading.voidCreditNote({ ...scope, creditNoteId }))
        if (method === 'POST' && credit[2] === 'reverse') {
          const b = await body()
          return response(trading.reverseCreditNote({ ...scope, id: creditNoteId,
            reversedOn: required(b['reversedOn'], 'reversedOn'), reason: required(b['reason'], 'reason'),
            requestKey: required(b['requestKey'], 'requestKey') }))
        }
      }
      if (path === '/api/documents') {
        const subjectType = subject(url.searchParams.get('subjectType'))
        const subjectId = required(url.searchParams.get('subjectId'), 'subjectId')
        if (method === 'GET') return response({ items: documents.list({ ...scope, subjectType, subjectId }) })
        const declared = Number(request.headers.get('content-length') ?? 'NaN')
        if (Number.isFinite(declared) && (declared < 1 || declared > binaryLimit))
          return response({ error: { code: 'BODY_TOO_LARGE', message: 'Attachment limit is 10 MiB' }, requestId }, 413)
        const data = new Uint8Array(await request.arrayBuffer())
        if (data.byteLength < 1 || data.byteLength > binaryLimit)
          return response({ error: { code: 'BODY_TOO_LARGE', message: 'Attachment must be 1 byte to 10 MiB' }, requestId }, 413)
        return response(documents.attach({ ...scope, subjectType, subjectId,
          filename: required(url.searchParams.get('filename'), 'filename'),
          mediaType: required(request.headers.get('content-type'), 'content-type').split(';')[0]!.trim(), data }), 201)
      }
      const attachment = new RegExp(`^/api/documents/(${ID})$`, 'u').exec(path)
      if (attachment && method === 'GET') {
        const file = documents.read({ ...scope, attachmentId: attachment[1]! })
        return new Response(new Uint8Array(file.data), { status: 200, headers: {
          'content-type': file.mediaType, 'content-length': String(file.byteLength),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
        } })
      }
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
    } catch (error) {
      const known = error instanceof IdentityError || error instanceof TradeError || error instanceof AccountingError
      const code = known ? error.code : 'INTERNAL_ERROR'
      const status: Record<string, number> = { INVALID_INPUT: 400, VALIDATION_FAILED: 400, AMOUNT_OUT_OF_RANGE: 400,
        NOT_AUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, CONFLICT: 409, INVALID_STATE: 409, PERIOD_CLOSED: 409 }
      return response({ error: { code, message: known ? error.message : 'Internal server error' }, requestId }, status[code] ?? 500)
    }
  }
}
