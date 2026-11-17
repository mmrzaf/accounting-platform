import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as httpRequest } from 'node:http'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAccountingService } from '../../src/modules/accounting/service.ts'
import { createApplication } from '../../src/platform/server/application.ts'
import { listen } from '../../src/platform/server/node-http.ts'
const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const password = 'correct horse battery staple 123456'

test('real HTTP listener uses existing identity/trading/accounting services with permission and CSRF checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acct-server-'))
  const dbPath = join(dir, 'application.sqlite')
  let base = 'http://127.0.0.1:9999'
  try {
    const db = openDatabase(dbPath)
    applyMigrations(db, migrations)
    const identity = createIdentityService(db)
    const boot = await identity.bootstrapOrganization({ slug: 'server', name: 'Server Co', adminUsername: 'admin', adminDisplayName: 'Admin', password })
    const { token } = await identity.login({ organizationSlug: 'server', username: 'admin', password })
    const scope = { sessionToken: token, companyId: boot.company.id }
    const ledger = createAccountingService(db)
    ledger.setupBook({ ...scope, baseCurrency: 'IRR', baseDecimals: 0, timezone: 'Asia/Tehran' })
    ledger.addPeriod({ ...scope, code: 'FY2026', startsOn: '2026-01-01', endsOn: '2026-12-31' })
    const other = await identity.bootstrapOrganization({ slug: 'other', name: 'Other Org', adminUsername: 'admin', adminDisplayName: 'Admin', password })
    const controlAccountId = ledger.createAccount({ ...scope, code: 'receivable', name: 'Receivable', category: 'asset' }).id
    const revenue = ledger.createAccount({ ...scope, code: 'revenue', name: 'Sales', category: 'revenue' }).id
    db.close()
    const app = createApplication({ databasePath: dbPath, migrationDirectory: migrations, publicOrigin: () => base })
    try {
      const bound = await listen(app.server, '127.0.0.1', 0)
      base = `http://127.0.0.1:${bound.port}`
      const get = (path: string, cookie?: string) => fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} })
      const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ organizationSlug: 'server', username: 'admin', password }) })
      assert.equal(login.status, 200)
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!
      const { csrfToken } = await login.json() as { csrfToken: string }
      const send = (path: string, body: unknown, overrides: Record<string, string> = {}) =>
        fetch(`${base}${path}`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json', origin: base, ...overrides }, body: JSON.stringify(body) })
      assert.equal((await get('/health/live')).status, 200)
      assert.equal((await get('/health/ready')).status, 200)
      assert.equal((await get(`/api/business/contacts?companyId=${boot.company.id}`)).status, 401)
      const contact = await send(`/api/business/contacts?companyId=${boot.company.id}`, { displayName: 'Customer A', requestKey: 'contact-a' })
      assert.equal(contact.status, 201)
      const { id: partyId } = await contact.json() as { id: string }
      assert.equal((await get(`/api/business/contacts?companyId=${boot.company.id}`, cookie)).status, 200)
      assert.equal((await get(`/api/business/contacts?companyId=00000000-0000-4000-8000-000000000001`, cookie)).status, 404)
      const otherLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ organizationSlug: 'other', username: 'admin', password }) })
      assert.equal(otherLogin.status, 200)
      const foreignCookie = otherLogin.headers.get('set-cookie')!.split(';')[0]!
      const foreignCsrf = (await otherLogin.json() as { csrfToken: string }).csrfToken
      assert.equal((await get(`/api/business/contacts?companyId=${boot.company.id}`, foreignCookie)).status, 404)
      assert.equal((await fetch(`${base}/api/business/contacts?companyId=${boot.company.id}`, { method: 'POST',
        headers: { cookie: foreignCookie, 'x-csrf-token': foreignCsrf, 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ displayName: 'Foreign injection', requestKey: 'foreign-attempt' }) })).status, 404)
      assert.equal((await get(`/api/business/contacts?companyId=${other.company.id}`, cookie)).status, 404)
      const draft = await send(`/api/business/invoices?companyId=${boot.company.id}`, { kind: 'sale', partyId, issuedOn: '2026-10-01',
        controlAccountId, description: 'Sale', requestKey: 'invoice-a', lines: [{ itemKind: 'service', description: 'Services', quantity: '1', unitPriceMinor: '5000', accountId: revenue }] })
      assert.equal(draft.status, 201)
      const { id: invoiceId } = await draft.json() as { id: string }
      const post = await send(`/api/business/invoices/${invoiceId}/post?companyId=${boot.company.id}`, {})
      assert.equal(post.status, 200)
      const posted = await post.json() as { status: string; totalMinor: string }
      assert.equal(posted.status, 'posted')
      assert.equal(posted.totalMinor, '5000')
      const pnl = await get(`/api/business/reports/profit-and-loss?companyId=${boot.company.id}&from=2026-10-01&through=2026-10-31`, cookie)
      assert.equal(pnl.status, 200)
      assert.equal((await pnl.json() as { revenueMinor: string }).revenueMinor, '5000')
      const replay = await send(`/api/business/invoices/${invoiceId}/post?companyId=${boot.company.id}`, {})
      assert.equal(replay.status, 200)
      assert.equal((await replay.json() as { replayed: boolean }).replayed, true)
      const withoutCsrf = await fetch(`${base}/api/business/contacts?companyId=${boot.company.id}`, { method: 'POST',
        headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Attack' }) })
      assert.equal(withoutCsrf.status, 403)
      assert.equal((await send(`/api/business/contacts?companyId=${boot.company.id}`, { displayName: 'Evil' }, { origin: 'https://evil.invalid' })).status, 403)
      assert.equal((await send(`/api/business/contacts?companyId=${boot.company.id}`, { displayName: 'Huge'.repeat(5000) })).status, 413)
      assert.equal((await get('/api/ai/provider', cookie)).status, 503)
      assert.equal((await get('/does-not-exist')).status, 404)
      assert.equal((await get(`/api/business/invoices?companyId=${boot.company.id}&kind=garbage`, cookie)).status, 400)
      assert.equal((await send(`/api/business/invoices?companyId=${boot.company.id}`, { kind: 'sale', lines: [{}] })).status, 400)
      const forgedHost = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(`${base}/api/auth/session`, { headers: { Host: 'attacker.invalid' } }, res => {
          res.resume(); res.on('end', () => resolve(res.statusCode ?? 0))
        })
        req.on('error', reject)
        req.end()
      })
      assert.equal(forgedHost, 400)
    } finally { await app.close() }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('listener rejects public binding without trusted TLS proxy', async () => {
  const { createNodeHttpServer } = await import('../../src/platform/server/node-http.ts')
  const server = createNodeHttpServer({ origin: 'http://127.0.0.1:9999', handler: async () => new Response('ok') })
  const { listen } = await import('../../src/platform/server/node-http.ts')
  await assert.rejects(() => listen(server, '0.0.0.0', 0), /non-loopback/u)
})
