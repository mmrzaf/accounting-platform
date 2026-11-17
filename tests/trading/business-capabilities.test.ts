import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAccountingService } from '../../src/modules/accounting/service.ts'
import { createTradingService } from '../../src/modules/trading/service.ts'
import { createTaxService } from '../../src/modules/tax/service.ts'
import { createInventoryService } from '../../src/modules/inventory/service.ts'
import { createContactImportService, parseContactCsv } from '../../src/modules/imports/contacts.ts'
import { createBusinessReports } from '../../src/modules/reports/service.ts'
import { createDocumentService } from '../../src/modules/documents/service.ts'
const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const fixedClock = () => new Date('2026-11-17T10:00:00.000Z')
async function fixture<T>(fn: (f: Awaited<ReturnType<typeof make>>) => Promise<T> | T) {
  const dir = mkdtempSync(join(tmpdir(), 'phase7-')), db = openDatabase(':memory:')
  try { applyMigrations(db, migrations); return await fn(await make(db, dir)) }
  finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
}
async function make(db: DatabaseSync, dir: string) {
  const identity = createIdentityService(db, { clock: fixedClock }), accounting = createAccountingService(db, { clock: fixedClock })
  const trading = createTradingService(db, { clock: fixedClock }), tax = createTaxService(db, { clock: fixedClock })
  const inventory = createInventoryService(db, { clock: fixedClock }), imports = createContactImportService(db, { clock: fixedClock })
  const reports = createBusinessReports(db, { clock: fixedClock }), documents = createDocumentService(db, join(dir, 'blobs'), { clock: fixedClock })
  const boot = await identity.bootstrapCompany({ name: 'Phase Seven', adminUsername: 'owner', adminDisplayName: 'Owner', password: 'correct horse battery staple 123456' })
  const { token } = await identity.login({ username: 'owner', password: 'correct horse battery staple 123456' })
  const scope = { sessionToken: token, companyId: boot.company.id }
  accounting.setupBook({ ...scope, baseCurrency: 'IRR', baseDecimals: 0, timezone: 'Asia/Tehran' })
  accounting.addPeriod({ ...scope, code: 'FY', startsOn: '2026-01-01', endsOn: '2026-12-31' })
  const ar = accounting.createAccount({ ...scope, code: 'ar', name: 'AR', category: 'asset' }).id
  const bank = accounting.createAccount({ ...scope, code: 'bank', name: 'Bank', category: 'asset' }).id
  const revenue = accounting.createAccount({ ...scope, code: 'revenue', name: 'Revenue', category: 'revenue' }).id
  const contact = trading.createContact({ ...scope, displayName: 'Ali', code: 'ali' })
  const draft = trading.createInvoice({ ...scope, kind: 'sale', partyId: contact.id, issuedOn: '2026-10-15', controlAccountId: ar,
    description: 'Service sale', requestKey: 'initial-sale', lines: [{ itemKind: 'service', description: 'Services', quantity: '10', unitPriceMinor: '1000', accountId: revenue }] })
  const posted = trading.postInvoice({ ...scope, id: draft.id })
  return { db, dir, identity, accounting, trading, tax, inventory, imports, reports, documents, boot, scope, contact, ar, bank, revenue, posted }
}
test('tax schedules are append-only, dated, precisely rounded and company scoped', () => fixture(f => {
  const { tax, scope, db } = f
  const first = tax.configure({ ...scope, code: 'vat', name: 'VAT', effectiveOn: '2026-01-01', ratePpm: 100_000 })
  assert.equal(first.replayed, false)
  assert.equal(tax.configure({ ...scope, code: 'vat', name: 'VAT', effectiveOn: '2026-01-01', ratePpm: 100_000 }).replayed, true)
  assert.equal(tax.quote({ ...scope, code: 'vat', on: '2026-04-01', amountMinor: '101' }).calculatedTaxMinor, '10')
  tax.configure({ ...scope, code: 'vat', name: 'VAT', effectiveOn: '2026-09-01', ratePpm: 90_000 })
  assert.equal(tax.atDate({ ...scope, code: 'vat', on: '2026-08-31' }).ratePpm, 100_000)
  assert.equal(tax.atDate({ ...scope, code: 'vat', on: '2026-09-01' }).ratePpm, 90_000)
  assert.throws(() => tax.configure({ ...scope, code: 'vat', name: 'Different', effectiveOn: '2026-01-01', ratePpm: 100_000 }), /already configured/u)
  assert.throws(() => db.prepare('UPDATE tax_code_versions SET rate_ppm=0 WHERE id=?').run(first.id), /append-only/u)
  assert.throws(() => tax.quote({ ...scope, code: 'vat', on: '2025-01-01', amountMinor: '100' }))
}))
test('quantity stock maintains chronological nonnegative balances and immutable movements', () => fixture(f => {
  const { inventory, scope, db } = f
  const item = inventory.createItem({ ...scope, sku: 'a-1', name: 'Boxes', unit: 'piece' })
  const inbound = inventory.move({ ...scope, itemId: item.id, direction: 'in', on: '2026-11-10', quantity: '10.5', note: 'Received', requestKey: 'stock1' })
  assert.equal(inbound.quantityMilli, '10500')
  assert.equal(inventory.move({ ...scope, itemId: item.id, direction: 'in', on: '2026-11-10', quantity: '10.5', note: 'Received', requestKey: 'stock1' }).replayed, true)
  inventory.move({ ...scope, itemId: item.id, direction: 'out', on: '2026-11-11', quantity: '3', note: 'Issued', requestKey: 'stock2' })
  assert.equal(inventory.getItem({ ...scope, itemId: item.id }).quantityMilli, '7500')
  assert.throws(() => inventory.move({ ...scope, itemId: item.id, direction: 'out', on: '2026-11-11', quantity: '8', note: 'Too many', requestKey: 'stock3' }), /Insufficient/u)
  assert.throws(() => inventory.move({ ...scope, itemId: item.id, direction: 'in', on: '2026-11-09', quantity: '1', note: 'Backdated', requestKey: 'stock4' }), /Backdated/u)
  assert.throws(() => inventory.setItemStatus({ ...scope, itemId: item.id, status: 'archived' }), /remaining stock/u)
  assert.throws(() => db.prepare('UPDATE stock_movements SET quantity_milli=1 WHERE id=?').run(inbound.id), /append-only/u)
  assert.equal(checkDatabase(db).ok, true)
}))
test('contact CSV import uses real transactional service paths for both preview and commit', () => fixture(f => {
  const { imports, trading, scope, db } = f
  const csv = '\uFEFFdisplayName,code\r\n"Ali, Jr",ali-jr\r\n"Mary ""M""",mary\r\n'
  assert.deepEqual(parseContactCsv(csv), [{ displayName: 'Ali, Jr', code: 'ali-jr' }, { displayName: 'Mary "M"', code: 'mary' }])
  const initial = Number(db.prepare('SELECT count(*) AS n FROM contacts').get()?.['n'])
  const preview = imports.importContacts({ ...scope, csv, batchKey: 'batch-1', dryRun: true })
  assert.equal(preview.created, 2)
  assert.equal(preview.rows[0]?.id, null) // Preview IDs must not point to rolled-back records.
  assert.equal(Number(db.prepare('SELECT count(*) AS n FROM contacts').get()?.['n']), initial)
  assert.equal(imports.importContacts({ ...scope, csv, batchKey: 'batch-1' }).created, 2)
  assert.equal(imports.importContacts({ ...scope, csv, batchKey: 'batch-1' }).replayed, 2)
  assert.throws(() => imports.importContacts({ ...scope, csv: 'displayName,code\nAli,ali-jr\n', batchKey: 'batch-1' }), /batch key reused/u)
  assert.equal(trading.listContacts(scope).length, initial + 2)
  assert.throws(() => imports.importContacts({ ...scope, batchKey: 'batch-2', csv: 'displayName,code\nNew,new\nBad,ali\n' }), /Contact code exists/u)
  assert.equal(trading.listContacts(scope).length, initial + 2)
  assert.throws(() => parseContactCsv('displayName,code\n"unclosed,x'))
}))
test('financial reports reconcile invoice aging, credits and exact P&L', () => fixture(f => {
  const { reports, scope, trading, accounting, posted } = f
  assert.equal(reports.profitAndLoss({ ...scope, from: '2026-10-01', through: '2026-10-31' }).revenueMinor, '10000')
  assert.equal(reports.profitAndLoss({ ...scope, from: '2026-11-01', through: '2026-11-30' }).revenueMinor, '0')
  assert.equal(reports.invoiceAging({ ...scope, kind: 'sale' }).buckets.days31to60Minor, '10000')
  const note = trading.createCreditNote({ ...scope, invoiceId: posted.id, invoiceLineId: posted.lines[0]!.id,
    creditedOn: '2026-11-17', amountMinor: '3000', reason: 'Price adjustment', requestKey: 'credit-1' })
  const credit = trading.postCreditNote({ ...scope, creditNoteId: note.id })
  assert.equal(credit.status, 'posted')
  assert.equal(trading.postCreditNote({ ...scope, creditNoteId: note.id }).replayed, true)
  assert.equal(trading.getInvoice({ ...scope, invoiceId: posted.id }).outstandingMinor, '7000')
  assert.equal(reports.invoiceAging({ ...scope, kind: 'sale' }).totalOutstandingMinor, '7000')
  assert.equal(reports.profitAndLoss({ ...scope, from: '2026-11-01', through: '2026-11-30' }).revenueMinor, '-3000')
  assert.equal(accounting.trialBalance(scope).totalDebitMinor, accounting.trialBalance(scope).totalCreditMinor)
  assert.throws(() => trading.reverseInvoice({ ...scope, id: posted.id, reversedOn: '2026-11-17', reason: 'Try', requestKey: 'reverse-too-early' }), /credit notes/u)
  const rev = trading.reverseCreditNote({ ...scope, id: note.id, reversedOn: '2026-11-17', reason: 'Credit incorrect', requestKey: 'reverse-credit-1' })
  assert.equal(rev.status, 'reversed')
  assert.equal(trading.getInvoice({ ...scope, invoiceId: posted.id }).outstandingMinor, '10000')
  assert.equal(checkDatabase(f.db).ok, true)
}))
test('credit amount, posted payments and direct SQL cannot create negative outstanding invoice', () => fixture(f => {
  const { trading, scope, posted, ar, bank, contact, db } = f
  const pay = trading.createPayment({ ...scope, kind: 'receipt', partyId: contact.id, paidOn: '2026-11-17', controlAccountId: ar,
    bankAccountId: bank, amountMinor: '8000', requestKey: 'receipt-1', description: 'Paid' })
  const receipt = trading.postPayment({ ...scope, id: pay.id })
  const note = trading.createCreditNote({ ...scope, invoiceId: posted.id, invoiceLineId: posted.lines[0]!.id,
    creditedOn: '2026-11-17', amountMinor: '3000', reason: 'Too much', requestKey: 'credit-2' })
  trading.allocatePayment({ ...scope, paymentId: receipt.id, invoiceId: posted.id, amountMinor: '8000', requestKey: 'alloc-1' })
  assert.throws(() => trading.postCreditNote({ ...scope, creditNoteId: note.id }), /remaining unpaid/u)
  assert.equal(trading.getCreditNote({ ...scope, creditNoteId: note.id }).status, 'draft')
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM journal_entries WHERE source_type='trade.credit_note'").get()?.['n']), 0)
  const small = trading.createCreditNote({ ...scope, invoiceId: posted.id, invoiceLineId: posted.lines[0]!.id,
    creditedOn: '2026-11-17', amountMinor: '2000', reason: 'Exact remainder', requestKey: 'credit-3' })
  trading.postCreditNote({ ...scope, creditNoteId: small.id })
  assert.equal(trading.getInvoice({ ...scope, invoiceId: posted.id }).outstandingMinor, '0')
  assert.throws(() => trading.allocatePayment({ ...scope, invoiceId: posted.id, paymentId: receipt.id, amountMinor: '1', requestKey: 'alloc-2' }))
  assert.equal(checkDatabase(db).ok, true)
}))
test('attachments enforce scoped reference, checksum, size limits and protected file naming', () => fixture(f => {
  const { documents, scope, posted, db, dir } = f
  const content = Buffer.from('invoice attachment content')
  const file = documents.attach({ ...scope, subjectType: 'invoice', subjectId: posted.id, filename: 'receipt.txt', mediaType: 'text/plain', data: content })
  assert.equal(documents.read({ ...scope, attachmentId: file.id }).data.toString(), content.toString())
  assert.equal(documents.list({ ...scope, subjectType: 'invoice', subjectId: posted.id }).length, 1)
  assert.throws(() => documents.attach({ ...scope, subjectType: 'invoice', subjectId: posted.id, filename: '../escape', mediaType: 'text/plain', data: content }))
  assert.throws(() => documents.attach({ ...scope, subjectType: 'invoice', subjectId: posted.id, filename: 'empty.txt', mediaType: 'text/plain', data: Buffer.alloc(0) }))
  const path = join(dir, 'blobs', scope.companyId, `${file.id}.blob`)
  writeFileSync(path, Buffer.from('tampered'))
  assert.throws(() => documents.read({ ...scope, attachmentId: file.id }), /size mismatch/u)
  assert.equal(readFileSync(path).toString(), 'tampered')
  assert.throws(() => db.prepare('DELETE FROM document_attachments WHERE id=?').run(file.id), /retained/u)
}))

test('new business capabilities enforce organization/company isolation and read-only roles', () => fixture(async f => {
  const { identity, scope, inventory, tax, reports, documents, imports, posted, db } = f
  const item = inventory.createItem({ ...scope, sku: 'boxed', name: 'Boxed', unit: 'pcs' })
  tax.configure({ ...scope, code: 'vat', name: 'VAT', effectiveOn: '2026-01-01', ratePpm: 100000 })
  const attachment = documents.attach({ ...scope, subjectType: 'invoice', subjectId: posted.id,
    filename: 'file.txt', mediaType: 'text/plain', data: Buffer.from('private data') })
  const company2 = await identity.bootstrapCompany({name:'Other company',adminUsername:'other-owner',adminDisplayName:'Other Owner',password:'separate secure password 98765'})
  const s2 = { ...scope, companyId: company2.company.id }
  assert.throws(() => inventory.listItems(s2))
  assert.throws(() => tax.list(s2))
  assert.throws(() => inventory.getItem({ ...s2, itemId: item.id }))
  assert.throws(() => documents.read({ ...s2, attachmentId: attachment.id }))
  assert.throws(() => reports.invoiceAging({ ...s2, kind: 'sale' }))
  const third = await identity.bootstrapCompany({ name: 'Foreign', adminUsername: 'foreign-owner',
    adminDisplayName: 'Owner', password: 'separate secure password 12345' })
  const external = await identity.login({ username: 'foreign-owner', password: 'separate secure password 12345' })
  const foreignScope = { sessionToken: external.token, companyId: third.company.id }
  assert.throws(() => inventory.getItem({ ...foreignScope, itemId: item.id }))
  assert.throws(() => documents.read({ ...foreignScope, attachmentId: attachment.id }))
  assert.deepEqual(tax.list(foreignScope), [])
  const password = 'read only role secure password'
  const user = await identity.createUser({ sessionToken: scope.sessionToken, username: 'reader', displayName: 'Reader', password })
  const role = identity.listRoles({ sessionToken: scope.sessionToken }).find(r => r.code === 'company-reader')!
  identity.assignRole({ sessionToken: scope.sessionToken, roleId: role.id, userId: user.id})
  const login = await identity.login({ username: 'reader', password })
  const readerScope = { sessionToken: login.token, companyId: scope.companyId }
  assert.equal(inventory.getItem({ ...readerScope, itemId: item.id }).sku, 'boxed')
  assert.equal(tax.list(readerScope).length, 1)
  assert.equal(documents.list({ ...readerScope, subjectType: 'invoice', subjectId: posted.id }).length, 1)
  assert.throws(() => inventory.createItem({ ...readerScope, sku: 'denied', name: 'Denied', unit: 'pcs' }))
  assert.throws(() => tax.configure({ ...readerScope, code: 'test', name: 'Test', effectiveOn: '2026-01-01', ratePpm: 1000 }))
  assert.throws(() => imports.importContacts({ ...readerScope, csv: 'displayName,code\nX,x\n', batchKey: 'reader' }))
  assert.throws(() => documents.attach({ ...readerScope, subjectType: 'invoice', subjectId: posted.id,
    filename: 'denied.txt', mediaType: 'text/plain', data: Buffer.from('no') }))
  assert.equal(checkDatabase(db).ok, true)
}))
test('stock SQL guard prevents bypassing service for negative amounts and archiving positive stock', () => fixture(f => {
  const { db, inventory, scope } = f
  const item = inventory.createItem({ ...scope, sku: 'locked', name: 'Locked stock', unit: 'unit' })
  inventory.move({ ...scope, itemId: item.id, direction: 'in', on: '2026-11-17', quantity: '3', note: 'Start', requestKey: 'sql-stock' })
  assert.throws(() => db.prepare("UPDATE stock_items SET status='archived' WHERE id=?").run(item.id), /Cannot archive/u)
  assert.throws(() => db.prepare(`INSERT INTO stock_movements(id,company_id,item_id,happened_on,direction,quantity_milli,request_key,fingerprint,note)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(), scope.companyId, item.id, '2026-11-17', 'out', 4000, 'inject1', 'hash', 'unauthorized'), /Negative stock/u)
  assert.equal(inventory.getItem({ ...scope, itemId: item.id }).quantityMilli, '3000')
}))
