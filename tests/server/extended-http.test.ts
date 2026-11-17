import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createApplication } from '../../src/platform/server/application.ts'
import { listen } from '../../src/platform/server/node-http.ts'

const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const password = 'a robust passphrase for local use 2026'

test('exposes complete authorized accounting setup, import, inventory, taxes, credit notes and attachments over HTTP', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'accounting-http-extended-'))
  const databasePath = join(dir, 'data', 'books.sqlite')
  let base = 'http://127.0.0.1:30000'
  try {
    const db = openDatabase(databasePath)
    applyMigrations(db, migrations)
    const identity = createIdentityService(db)
    const boot = await identity.bootstrapCompany({ name: 'Business', adminUsername: 'owner', adminDisplayName: 'Owner', password })
    const outsider = await identity.bootstrapCompany({ name: 'Outsider', adminUsername: 'outsider', adminDisplayName: 'Owner', password })
    db.close()
    const app = createApplication({ databasePath, migrationDirectory: migrations, publicOrigin: () => base, attachmentDirectory: join(dir, 'documents') })
    try {
      const listener = await listen(app.server, '127.0.0.1', 0)
      base = `http://127.0.0.1:${listener.port}`
      const auth = async (username: string) => {
        const result = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }) })
        assert.equal(result.status, 200)
        const payload = await result.json() as { csrfToken: string }
        return { cookie: result.headers.get('set-cookie')!.split(';')[0]!, csrf: payload.csrfToken }
      }
      const owner = await auth('owner')
      const foreign = await auth('outsider')
      const cid = boot.company.id
      const q = (path: string) => `${base}${path}${path.includes('?') ? '&' : '?'}companyId=${cid}`
      const get = (path: string, user = owner) => fetch(q(path), { headers: { cookie: user.cookie } })
      const post = (path: string, data: unknown, user = owner, headers: Record<string, string> = {}) =>
        fetch(q(path), { method: 'POST', headers: { origin: base, cookie: user.cookie,
          'x-csrf-token': user.csrf, 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) })
      const ok = async (result: Response, status: number) => {
        if (result.status !== status) assert.fail(`Expected ${status}, got ${result.status}: ${await result.text()}`)
        return result.json() as Promise<Record<string, unknown>>
      }
      assert.equal((await get('/api/accounting/book')).status, 404)
      await ok(await post('/api/accounting/book', { baseCurrency: 'IRR', baseDecimals: 0, timezone: 'Asia/Tehran' }), 201)
      assert.equal((await get('/api/accounting/book')).status, 200)
      await ok(await post('/api/accounting/currencies', { code: 'USD', decimals: 2, name: 'US Dollar' }), 201)
      assert.equal((await get('/api/accounting/currencies')).status, 200)
      await ok(await post('/api/accounting/periods', { code: 'FY26', startsOn: '2026-01-01', endsOn: '2026-12-31' }), 201)
      const accounts: Record<string, string> = {}
      for (const [code, category] of [['cash', 'asset'], ['receivable', 'asset'], ['sales', 'revenue']] as const) {
        const row = await ok(await post('/api/accounting/accounts', { code, name: code, category }), 201)
        accounts[code] = row['id'] as string
      }
      const contact = await ok(await post('/api/business/contacts', { displayName: 'Client A', requestKey: randomUUID() }), 201)
      const partyId = contact['id'] as string
      const draft = await ok(await post('/api/business/invoices', { kind: 'sale', partyId,
        issuedOn: '2026-11-01', controlAccountId: accounts['receivable'], description: 'Consulting service', requestKey: randomUUID(),
        lines: [{ itemKind: 'service', description: 'Consulting', quantity: '1', unitPriceMinor: '1000', accountId: accounts['sales'] }] }), 201)
      const invoiceId = draft['id'] as string
      await ok(await post(`/api/business/invoices/${invoiceId}/post`, {}), 200)
      const trial = await ok(await get('/api/accounting/trial-balance'), 200)
      assert.equal(trial['totalDebitMinor'], '1000')
      assert.equal(trial['totalCreditMinor'], '1000')
      const ledger = await ok(await get(`/api/accounting/ledger?accountId=${accounts['receivable']}`), 200)
      assert.equal((ledger['rows'] as unknown[]).length, 1)
      const fs = await ok(await get('/api/accounting/financial-summary?through=2026-10-01'), 200)
      assert.equal(fs['revenueMinor'], '0')
      assert.equal((await get('/api/accounting/accounts', foreign)).status, 404)
      const book = await get('/api/accounting/book', foreign)
      assert.equal(book.status, 404)
      assert.equal((await post('/api/accounting/accounts', { code: 'bad', name: 'bad', category: 'asset' }, foreign)).status, 404)
      assert.equal((await post('/api/accounting/accounts', { code: 'bad', name: 'bad', category: 'asset' }, owner, { 'x-csrf-token': 'invalid' })).status, 403)
      assert.equal((await post('/api/accounting/accounts', { code: 'bad', name: 'bad', category: 'bogus' })).status, 400)
      const schedule = await ok(await post('/api/tax/codes', { code: 'vat', name: 'VAT Example', effectiveOn: '2026-01-01', ratePpm: 100000 }), 201)
      assert.equal(schedule['ratePpm'], 100000)
      const quote = await ok(await get('/api/tax/quote?code=vat&on=2026-11-01&amountMinor=1000'), 200)
      assert.equal(quote['calculatedTaxMinor'], '100')
      const item = await ok(await post('/api/inventory/items', { sku: 'SKU-A', name: 'Test Item', unit: 'pcs' }), 201)
      const itemId = item['id'] as string
      const movement = { direction: 'in', quantity: '5.125', on: '2026-11-01', note: 'Opening count', requestKey: randomUUID() }
      const stock = await ok(await post(`/api/inventory/items/${itemId}/movements`, movement), 201)
      assert.equal(stock['quantityMilli'], '5125')
      assert.equal((await get(`/api/inventory/items/${itemId}`)).status, 200)
      assert.equal((await post(`/api/inventory/items/${itemId}/movements`, { ...movement, requestKey: randomUUID(), direction: 'out', quantity: '6' })).status, 409)
      const csv = 'displayName,code\nImported Client,code-1\n'
      const preview = await ok(await post('/api/imports/contacts', { csv, batchKey: 'batch-a', dryRun: true }), 201)
      assert.equal(preview['dryRun'], true)
      const imported = await ok(await post('/api/imports/contacts', { csv, batchKey: 'batch-a', dryRun: false }), 201)
      assert.equal(imported['created'], 1)
      const note = await ok(await post('/api/credit-notes', { invoiceId, invoiceLineId: (await ok(await get(`/api/business/invoices/${invoiceId}`), 200))['lines']
        ? ((await ok(await get(`/api/business/invoices/${invoiceId}`), 200))['lines'] as {id:string}[])[0]!.id : '',
        creditedOn: '2026-11-02', amountMinor: '250', reason: 'Partial concession', requestKey: randomUUID() }), 201)
      assert.equal((await post(`/api/credit-notes/${note['id'] as string}/post`, {})).status, 200)
      const afterCredit = await ok(await get('/api/business/reports/aging?kind=sale'), 200)
      assert.equal(afterCredit['totalOutstandingMinor'], '750')
      const filename = 'invoice-proof.txt'
      const attachmentQuery = `/api/documents?subjectType=invoice&subjectId=${invoiceId}&filename=${encodeURIComponent(filename)}`
      const data = Buffer.from('Invoice evidence', 'utf8')
      const uploaded = await fetch(q(attachmentQuery), { method: 'POST', headers: { origin: base, cookie: owner.cookie,
        'x-csrf-token': owner.csrf, 'content-type': 'text/plain' }, body: data })
      const file = await ok(uploaded, 201)
      assert.equal((await get(`/api/documents?subjectType=invoice&subjectId=${invoiceId}`)).status, 200)
      const downloaded = await get(`/api/documents/${file['id'] as string}`)
      assert.equal(downloaded.status, 200)
      assert.equal(await downloaded.text(), data.toString())
      assert.match(downloaded.headers.get('content-disposition') ?? '', /attachment/u)
      assert.equal((await get(`/api/documents/${file['id'] as string}`, foreign)).status, 404)
      assert.equal((await get('/api/business/reports/balance-sheet?through=2026-10-01')).status, 200)
      const emptyYear = await ok(await get('/api/business/reports/balance-sheet?through=2026-10-01'), 200)
      assert.equal(emptyYear['assetsMinor'], '0')
      assert.equal((await get('/api/documents?subjectType=invalid&subjectId='+invoiceId)).status, 400)
      assert.equal((await get('/api/inventory/items', foreign)).status, 200)
      assert.equal((await get('/api/tax/codes', foreign)).status, 200)
      assert.equal((await get(`/api/credit-notes?invoiceId=${invoiceId}`, foreign)).status, 404)
      assert.ok(outsider.company.id)
    } finally { await app.close() }
  } finally { await rm(dir, { recursive: true, force: true }) }
})
