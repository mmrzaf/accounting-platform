import { randomUUID } from 'node:crypto'
import type { createIdentityService } from '../../modules/identity/service.ts'
import type { createAccountingService } from '../../modules/accounting/service.ts'
import { IdentityError, unauthenticated } from '../../modules/identity/errors.ts'
import { AccountingError } from '../../modules/accounting/errors.ts'
import type { AccountCategory, JournalLineInput } from '../../modules/accounting/types.ts'
import { assertLocalOrTls, assertSameOrigin, bearerCookie, parseJson, response } from './request-security.ts'

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new IdentityError('VALIDATION_FAILED', `${name} is required`)
  return value
}
function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new IdentityError('VALIDATION_FAILED', `${name} must be an integer`)
  return value
}
function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new IdentityError('VALIDATION_FAILED', `${name} must be a boolean`)
  return value
}
function category(value: unknown): AccountCategory {
  if (value !== 'asset' && value !== 'liability' && value !== 'equity' && value !== 'revenue' && value !== 'expense')
    throw new IdentityError('VALIDATION_FAILED', 'Invalid account category')
  return value
}
function limited(value: string | null, name: string, fallback: number, max: number) {
  if (value === null) return fallback
  if (!/^(0|[1-9]\d{0,6})$/u.test(value) || Number(value) > max) throw new IdentityError('VALIDATION_FAILED', `Invalid ${name}`)
  return Number(value)
}
function journalLines(value: unknown): JournalLineInput[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) throw new IdentityError('VALIDATION_FAILED', 'A journal needs 2–100 lines')
  return value.map((line: unknown): JournalLineInput => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new IdentityError('VALIDATION_FAILED', 'Invalid journal line')
    const row = line as Record<string, unknown>
    if (row['foreign'] !== undefined) throw new IdentityError('VALIDATION_FAILED', 'Foreign currency manual journals are not exposed by this endpoint')
    return { accountId: required(row['accountId'], 'accountId'), debitMinor: required(row['debitMinor'], 'debitMinor'),
      creditMinor: required(row['creditMinor'], 'creditMinor'), ...(row['memo'] === undefined ? {} : { memo: required(row['memo'], 'memo') }) }
  })
}
/** Web API is an adapter, not a second accounting implementation. */
export function createAccountingHttpHandler(identity: ReturnType<typeof createIdentityService>, accounting: ReturnType<typeof createAccountingService>) {
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
      identity.me(sessionToken)
      if (method !== 'GET') identity.verifyCsrf(sessionToken, request.headers.get('x-csrf-token'))
      const scope = { sessionToken, companyId: required(url.searchParams.get('companyId'), 'companyId') }
      const body = () => parseJson(request)
      const path = url.pathname
      if (path === '/api/accounting/book') {
        if (method === 'GET') return response(accounting.getBook(scope))
        const b = await body()
        return response(accounting.setupBook({ ...scope, baseCurrency: required(b['baseCurrency'], 'baseCurrency'),
          baseDecimals: integer(b['baseDecimals'], 'baseDecimals'), timezone: required(b['timezone'], 'timezone') }), 201)
      }
      if (path === '/api/accounting/currencies') {
        if (method === 'GET') return response({ items: accounting.listCurrencies(scope) })
        const b = await body()
        return response(accounting.addCurrency({ ...scope, code: required(b['code'], 'code'),
          name: required(b['name'], 'name'), decimals: integer(b['decimals'], 'decimals') }), 201)
      }
      if (path === '/api/accounting/periods') {
        if (method === 'GET') return response({ items: accounting.listPeriods(scope) })
        const b = await body()
        return response(accounting.addPeriod({ ...scope, code: required(b['code'], 'code'),
          startsOn: required(b['startsOn'], 'startsOn'), endsOn: required(b['endsOn'], 'endsOn') }), 201)
      }
      const period = /^\/api\/accounting\/periods\/([0-9a-f-]{36})\/status$/u.exec(path)
      if (method === 'POST' && period) {
        const b = await body(), status = b['status']
        if (status !== 'open' && status !== 'closed') throw new IdentityError('VALIDATION_FAILED', 'Invalid period status')
        return response(accounting.setPeriodStatus({ ...scope, periodId: period[1]!, status }))
      }
      if (path === '/api/accounting/accounts') {
        if (method === 'GET') return response({ items: accounting.listAccounts(scope) })
        const b = await body()
        return response(accounting.createAccount({ ...scope, code: required(b['code'], 'code'),
          name: required(b['name'], 'name'), category: category(b['category']),
          ...(b['parentId'] === undefined || b['parentId'] === null ? {} : { parentId: required(b['parentId'], 'parentId') }),
          ...(b['postable'] === undefined ? {} : { postable: bool(b['postable'], 'postable') }) }), 201)
      }
      const account = /^\/api\/accounting\/accounts\/([0-9a-f-]{36})\/status$/u.exec(path)
      if (method === 'POST' && account) {
        const b = await body()
        return response(accounting.setAccountActive({ ...scope, accountId: account[1]!, active: bool(b['active'], 'active') }))
      }
      if (method === 'GET' && path === '/api/accounting/trial-balance')
        return response(accounting.trialBalance({ ...scope, ...(url.searchParams.has('through') ? { through: required(url.searchParams.get('through'), 'through') } : {}) }))
      if (method === 'GET' && path === '/api/accounting/financial-summary')
        return response(accounting.financialSummary({ ...scope, ...(url.searchParams.has('through') ? { through: required(url.searchParams.get('through'), 'through') } : {}) }))
      if (method === 'GET' && path === '/api/accounting/ledger')
        return response(accounting.generalLedger({ ...scope, accountId: required(url.searchParams.get('accountId'), 'accountId'),
          ...(url.searchParams.has('from') ? { from: required(url.searchParams.get('from'), 'from') } : {}),
          ...(url.searchParams.has('through') ? { through: required(url.searchParams.get('through'), 'through') } : {}),
          limit: limited(url.searchParams.get('limit'), 'limit', 100, 500), offset: limited(url.searchParams.get('offset'), 'offset', 0, 1_000_000) }))
      if (method === 'POST' && path === '/api/accounting/journals') {
        const b = await body()
        return response(accounting.postJournal({ ...scope, date: required(b['date'], 'date'),
          sourceType: 'manual', sourceId: required(b['sourceId'], 'sourceId'), sourceEvent: 'post',
          idempotencyKey: required(b['idempotencyKey'], 'idempotencyKey'),
          description: required(b['description'], 'description'), lines: journalLines(b['lines']) }), 201)
      }
      const journal = /^\/api\/accounting\/journals\/([0-9a-f-]{36})(?:\/(reverse))?$/u.exec(path)
      if (journal) {
        if (method === 'GET' && !journal[2]) return response(accounting.getJournal({ ...scope, journalId: journal[1]! }))
        if (method === 'POST' && journal[2] === 'reverse') {
          const b = await body()
          return response(accounting.reverseJournal({ ...scope, journalId: journal[1]!, date: required(b['date'], 'date'),
            idempotencyKey: required(b['idempotencyKey'], 'idempotencyKey'), reason: required(b['reason'], 'reason') }))
        }
      }
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' }, requestId }, 404)
    } catch (error) {
      const known = error instanceof AccountingError || error instanceof IdentityError
      const code = known ? error.code : 'INTERNAL_ERROR'
      const status: Record<string, number> = { INVALID_INPUT: 400, VALIDATION_FAILED: 400, AMOUNT_OUT_OF_RANGE: 400,
        NOT_AUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, CONFLICT: 409, PERIOD_CLOSED: 409,
        UNBALANCED: 400, IMMUTABLE: 409 }
      return response({ error: { code, message: known ? error.message : 'Internal server error' }, requestId }, status[code] ?? 500)
    }
  }
}
