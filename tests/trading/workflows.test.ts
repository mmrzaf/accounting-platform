import test from 'node:test'
import assert from 'node:assert/strict'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAccountingService } from '../../src/modules/accounting/service.ts'
import { createTradingService } from '../../src/modules/trading/service.ts'
import { TradeError } from '../../src/modules/trading/errors.ts'
import { AccountingError } from '../../src/modules/accounting/errors.ts'
import { IdentityError } from '../../src/modules/identity/errors.ts'
import type { CreateInvoiceInput, CreatePaymentInput } from '../../src/modules/trading/types.ts'
import { fileURLToPath } from 'node:url'
const migrationDir = fileURLToPath(new URL('../../migrations/', import.meta.url))
const password = 'a long password for trading integration tests'
const reject = (fn: () => unknown, code: string) => assert.throws(fn, error =>
  (error instanceof TradeError || error instanceof IdentityError || error instanceof AccountingError) && error.code === code)
async function fixture<T>(fn: (f: Awaited<ReturnType<typeof makeFixture>>) => T | Promise<T>) {
  const db = openDatabase(':memory:')
  applyMigrations(db, migrationDir)
  try { return await fn(await makeFixture(db)) } finally { db.close() }
}
async function makeFixture(db: DatabaseSync) {
  const identity = createIdentityService(db), accounting = createAccountingService(db), trade = createTradingService(db)
  const boot = await identity.bootstrapCompany({ name: 'Trading', adminUsername: 'owner', adminDisplayName: 'Owner', password })
  const { token } = await identity.login({ username: 'owner', password })
  const scope = { sessionToken: token, companyId: boot.company.id }
  function initialize(s: typeof scope) {
    accounting.setupBook({ ...s, baseCurrency: 'IRR', baseDecimals: 0, timezone: 'Asia/Tehran' })
    accounting.addPeriod({ ...s, code: 'FY', startsOn: '2026-01-01', endsOn: '2026-12-31' })
    return {
      ar: accounting.createAccount({ ...s, code: 'ar', name: 'Accounts receivable', category: 'asset' }).id,
      ap: accounting.createAccount({ ...s, code: 'ap', name: 'Accounts payable', category: 'liability' }).id,
      bank: accounting.createAccount({ ...s, code: 'bank', name: 'Bank', category: 'asset' }).id,
      revenue: accounting.createAccount({ ...s, code: 'revenue', name: 'Sales', category: 'revenue' }).id,
      expense: accounting.createAccount({ ...s, code: 'expense', name: 'Purchases', category: 'expense' }).id,
    }
  }
  const accounts = initialize(scope)
  const ali = trade.createContact({ ...scope, displayName: 'Ali', code: 'ali' })
  const sale = (key: string, overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput => ({ ...scope, kind: 'sale', partyId: ali.id, issuedOn: '2026-11-17',
    controlAccountId: accounts.ar, description: '20 services to Ali', requestKey: key,
    lines: [{ itemKind: 'service', description: 'Analysis', quantity: '20', unitPriceMinor: '2500000', accountId: accounts.revenue }], ...overrides })
  const purchase = (key: string, overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput => ({ ...scope, kind: 'purchase', partyId: ali.id, issuedOn: '2026-11-17',
    controlAccountId: accounts.ap, description: 'Office services', requestKey: key,
    lines: [{ itemKind: 'non_stock', description: 'Stationery', quantity: '2', unitPriceMinor: '15000', accountId: accounts.expense }], ...overrides })
  const receipt = (key: string, overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput => ({ ...scope, kind: 'receipt', partyId: ali.id, paidOn: '2026-11-17',
    controlAccountId: accounts.ar, bankAccountId: accounts.bank, amountMinor: '20000000', description: 'Received part of invoice', requestKey: key, ...overrides })
  const payment = (key: string, overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput => ({ ...scope, kind: 'payment', partyId: ali.id, paidOn: '2026-11-17',
    controlAccountId: accounts.ap, bankAccountId: accounts.bank, amountMinor: '15000', description: 'Paid supplier', requestKey: key, ...overrides })
  return { db, identity, accounting, trade, boot, scope, accounts, ali, sale, purchase, receipt, payment, initialize }
}

test('sales invoice posts atomically, partial receipt allocates without another journal', async () => fixture(f => {
  const { trade, accounting, scope, sale, receipt, accounts, db } = f
  const draft = trade.createInvoice(sale('sale-1'))
  assert.equal(draft.totalMinor, '50000000')
  assert.equal(draft.status, 'draft')
  assert.equal(trade.createInvoice(sale('sale-1')).replayed, true)
  assert.equal(db.prepare('SELECT count(*) AS c FROM journal_entries').get()?.['c'], 0)
  const posted = trade.postInvoice({ ...scope, id: draft.id })
  assert.equal(posted.status, 'posted')
  assert.equal(posted.number, 'S-000001')
  assert.equal(trade.postInvoice({ ...scope, id: draft.id }).replayed, true)
  assert.equal(accounting.getJournal({ ...scope, journalId: posted.journalId! }).sourceType, 'trade.invoice')
  assert.equal(accounting.trialBalance(scope).rows.find(r => r.accountId === accounts.ar)?.netDebitMinor, '50000000')
  const pay = trade.postPayment({ ...scope, id: trade.createPayment(receipt('receipt-1')).id })
  assert.equal(pay.amountMinor, '20000000')
  assert.equal(pay.number, 'R-000001')
  const before = Number(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'])
  const alloc = trade.allocatePayment({ ...scope, paymentId: pay.id, invoiceId: posted.id, amountMinor: '20000000', requestKey: 'allocation-1' })
  assert.equal(alloc.replayed, false)
  assert.equal(trade.allocatePayment({ ...scope, paymentId: pay.id, invoiceId: posted.id, amountMinor: '20000000', requestKey: 'allocation-1' }).replayed, true)
  assert.equal(Number(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n']), before)
  assert.equal(trade.getInvoice({ ...scope, invoiceId: posted.id }).outstandingMinor, '30000000')
  assert.equal(trade.getPayment({ ...scope, paymentId: pay.id }).unallocatedMinor, '0')
  assert.equal(accounting.trialBalance(scope).rows.find(r => r.accountId === accounts.ar)?.netDebitMinor, '30000000')
  assert.equal(accounting.trialBalance(scope).totalDebitMinor, accounting.trialBalance(scope).totalCreditMinor)
  assert.equal(checkDatabase(db).ok, true)
}))

test('purchase payable, supplier disbursement and partial allocation', async () => fixture(f => {
  const { trade, accounting, scope, purchase, payment, accounts } = f
  const invoice = trade.postInvoice({ ...scope, id: trade.createInvoice(purchase('purchase-1')).id })
  assert.equal(invoice.number, 'P-000001')
  const disbursement = trade.postPayment({ ...scope, id: trade.createPayment(payment('payment-1')).id })
  assert.equal(disbursement.number, 'D-000001')
  assert.equal(accounting.trialBalance(scope).rows.find(r => r.accountId === accounts.ap)?.netDebitMinor, '-15000')
  trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: disbursement.id, amountMinor: '15000', requestKey: 'allocate-purchase' })
  assert.equal(trade.getInvoice({ ...scope, invoiceId: invoice.id }).outstandingMinor, '15000')
  assert.equal(trade.getPayment({ ...scope, paymentId: disbursement.id }).unallocatedMinor, '0')
  assert.equal(trade.listInvoices({ ...scope, kind: 'purchase' }).length, 1)
  assert.equal(trade.listPayments({ ...scope, kind: 'payment' }).length, 1)
}))

test('idempotency conflicts, optimistic draft edits, immutable posted lines and cancellation', async () => fixture(f => {
  const { trade, scope, sale, receipt, db, accounts } = f
  const first = trade.createInvoice(sale('sale-1'))
  reject(() => trade.createInvoice(sale('sale-1', { description: 'Changed' })), 'CONFLICT')
  const revised = trade.reviseInvoice({ ...sale('revision-1'), invoiceId: first.id, expectedRevision: 1,
    lines: [{ itemKind: 'service', description: 'New description', quantity: '2.5', unitPriceMinor: '401', accountId: accounts.revenue }] })
  assert.equal(revised.revision, 2)
  assert.equal(revised.totalMinor, '1002') // half-even rounding: 1002.5 rounds to 1002
  reject(() => trade.reviseInvoice({ ...sale('revision-1'), invoiceId: first.id, expectedRevision: 1 }), 'CONFLICT')
  const posted = trade.postInvoice({ ...scope, id: first.id })
  reject(() => trade.reviseInvoice({ ...sale('revision-2'), invoiceId: first.id, expectedRevision: 2 }), 'INVALID_STATE')
  assert.throws(() => db.prepare('UPDATE trade_invoice_lines SET line_total_minor=1 WHERE invoice_id=?').run(first.id), /immutable/u)
  assert.throws(() => db.prepare('UPDATE trade_invoices SET total_minor=1 WHERE id=?').run(first.id), /immutable/u)
  assert.throws(() => db.prepare('DELETE FROM trade_invoices WHERE id=?').run(first.id), /cannot be deleted/u)
  assert.equal(trade.voidInvoice({ ...scope, id: trade.createInvoice(sale('void-sale')).id }).status, 'voided')
  reject(() => trade.voidInvoice({ ...scope, id: posted.id }), 'INVALID_STATE')
  const pay = trade.createPayment(receipt('receipt-1'))
  reject(() => trade.createPayment(receipt('receipt-1', { amountMinor: '10' })), 'CONFLICT')
  assert.equal(trade.voidPayment({ ...scope, id: pay.id }).status, 'voided')
  reject(() => trade.postPayment({ ...scope, id: pay.id }), 'INVALID_STATE')
}))

test('overallocations, wrong party, wrong direction and direct SQL constraints fail', async () => fixture(f => {
  const { trade, scope, sale, purchase, payment, receipt, accounts, db, ali } = f
  const invoice = trade.postInvoice({ ...scope, id: trade.createInvoice(sale('sale-1')).id })
  const pay = trade.postPayment({ ...scope, id: trade.createPayment(receipt('receipt-1')).id })
  reject(() => trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: pay.id, amountMinor: '50000001', requestKey: 'bad1' }), 'CONFLICT')
  reject(() => trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: pay.id, amountMinor: '20000001', requestKey: 'bad2' }), 'CONFLICT')
  const otherParty = trade.createContact({ ...scope, displayName: 'Sara' })
  const otherPay = trade.postPayment({ ...scope, id: trade.createPayment(receipt('other', { partyId: otherParty.id })).id })
  reject(() => trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: otherPay.id, amountMinor: '1', requestKey: 'bad3' }), 'CONFLICT')
  const purchaseInvoice = trade.postInvoice({ ...scope, id: trade.createInvoice(purchase('purchase-1')).id })
  const out = trade.postPayment({ ...scope, id: trade.createPayment(payment('pay-out')).id })
  reject(() => trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: out.id, amountMinor: '1', requestKey: 'bad4' }), 'CONFLICT')
  reject(() => trade.allocatePayment({ ...scope, invoiceId: purchaseInvoice.id, paymentId: pay.id, amountMinor: '1', requestKey: 'bad5' }), 'CONFLICT')
  assert.throws(() => db.prepare(`INSERT INTO payment_allocations(id,company_id,invoice_id,payment_id,amount_minor,request_key,fingerprint)
       VALUES(?,?,?,?,?,?,?)`).run('direct', scope.companyId, invoice.id, pay.id, 20000001, 'direct-key', 'hash'), /Overallocation/u)
  assert.equal(trade.listAllocations({ ...scope, invoiceId: invoice.id }).length, 0)
  assert.equal(accounts.bank.length > 0 && ali.id.length > 0, true)
}))

test('allocation reversal restores outstanding and allows ledger reversal of documents', async () => fixture(f => {
  const { trade, scope, sale, receipt, accounting, db } = f
  const invoice = trade.postInvoice({ ...scope, id: trade.createInvoice(sale('sale-1')).id })
  const pay = trade.postPayment({ ...scope, id: trade.createPayment(receipt('receipt-1')).id })
  const allocation = trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: pay.id, amountMinor: '20000000', requestKey: 'alloc' })
  reject(() => trade.reverseInvoice({ ...scope, id: invoice.id, reason: 'Error', reversedOn: '2026-11-18', requestKey: 'reverse-invoice' }), 'CONFLICT')
  reject(() => trade.reversePayment({ ...scope, id: pay.id, reason: 'Error', reversedOn: '2026-11-18', requestKey: 'reverse-payment' }), 'CONFLICT')
  reject(() => accounting.reverseJournal({ ...scope, journalId: invoice.journalId!, date: '2026-11-18', reason: 'Bypass document', idempotencyKey: 'unsafe-reverse' }), 'INVALID_INPUT')
  const revoked = trade.reverseAllocation({ ...scope, allocationId: allocation.id, reason: 'Incorrect allocation', requestKey: 'unalloc-1' })
  assert.equal(revoked.reversed, true)
  assert.equal(trade.reverseAllocation({ ...scope, allocationId: allocation.id, reason: 'Incorrect allocation', requestKey: 'unalloc-1' }).replayed, true)
  assert.equal(trade.getInvoice({ ...scope, invoiceId: invoice.id }).outstandingMinor, '50000000')
  assert.equal(trade.getPayment({ ...scope, paymentId: pay.id }).unallocatedMinor, '20000000')
  const reversedInvoice = trade.reverseInvoice({ ...scope, id: invoice.id, reason: 'Mistake', reversedOn: '2026-11-18', requestKey: 'reverse-invoice' })
  const reversedPayment = trade.reversePayment({ ...scope, id: pay.id, reason: 'Mistake', reversedOn: '2026-11-18', requestKey: 'reverse-payment' })
  assert.equal(reversedInvoice.status, 'reversed')
  assert.equal(reversedPayment.status, 'reversed')
  assert.equal(accounting.trialBalance(scope).totalDebitMinor, '0')
  assert.equal(accounting.trialBalance(scope).totalCreditMinor, '0')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'], 4)
  assert.equal(checkDatabase(db).ok, true)
}))

test('closed period causes entire invoice posting to roll back; opening a later period permits reversal', async () => fixture(f => {
  const { trade, accounting, scope, sale, db } = f
  const first = trade.createInvoice(sale('sale-1'))
  const period = accounting.listPeriods(scope)[0]!
  accounting.setPeriodStatus({ ...scope, periodId: period.id, status: 'closed' })
  reject(() => trade.postInvoice({ ...scope, id: first.id }), 'PERIOD_CLOSED')
  assert.equal(trade.getInvoice({ ...scope, invoiceId: first.id }).status, 'draft')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'], 0)
  assert.equal(db.prepare('SELECT count(*) AS n FROM trade_document_sequences').get()?.['n'], 0)
  accounting.setPeriodStatus({ ...scope, periodId: period.id, status: 'open' })
  const posted = trade.postInvoice({ ...scope, id: first.id })
  assert.equal(posted.number, 'S-000001')
  accounting.setPeriodStatus({ ...scope, periodId: period.id, status: 'closed' })
  accounting.addPeriod({ ...scope, code: 'next', startsOn: '2027-01-01', endsOn: '2027-12-31' })
  const reversed = trade.reverseInvoice({ ...scope, id: posted.id, reversedOn: '2027-01-02', reason: 'Late correction', requestKey: 'reverse-next' })
  assert.equal(reversed.status, 'reversed')
  assert.equal(accounting.trialBalance(scope).totalDebitMinor, '0')
}))

test('companies have isolated contacts, accounts, and invoice numbers', async () => fixture(async f => {
  const { identity, trade, scope, accounts, initialize, db } = f
  const separate = await identity.bootstrapCompany({name:'Second business',adminUsername:'other-owner',adminDisplayName:'Other Owner',password})
  const otherLogin = await identity.login({username:'other-owner',password})
  const secondScope = {sessionToken:otherLogin.token,companyId:separate.company.id}
  const accounts2 = initialize(secondScope)
  const contactFromA = trade.createContact({...scope,displayName:'Private contact'})
  reject(()=>trade.getContact({...secondScope,contactId:contactFromA.id}),'NOT_FOUND')
  const otherContact = trade.createContact({...secondScope,displayName:'Other contact'})
  const doc = trade.postInvoice({...secondScope,id:trade.createInvoice({...secondScope,kind:'sale',partyId:otherContact.id,
    controlAccountId:accounts2.ar,description:'Second company',issuedOn:'2026-11-17',requestKey:'same-key',
    lines:[{itemKind:'service',description:'Service',quantity:'1',unitPriceMinor:'500',accountId:accounts2.revenue}]}).id})
  reject(()=>trade.getInvoice({...scope,invoiceId:doc.id}),'NOT_FOUND')
  const own = trade.postInvoice({...scope,id:trade.createInvoice({...scope,kind:'sale',partyId:contactFromA.id,
    controlAccountId:accounts.ar,issuedOn:'2026-11-17',description:'First company',requestKey:'same-key',
    lines:[{itemKind:'service',description:'Service',quantity:'1',unitPriceMinor:'500',accountId:accounts.revenue}]}).id})
  assert.equal(own.number,'S-000001')
  assert.equal(doc.number,'S-000001')
  reject(()=>trade.getInvoice({...secondScope,invoiceId:own.id}),'NOT_FOUND')
  assert.equal(checkDatabase(db).ok,true)
}))

test('contact operations are retry-safe when keyed, editable with revision checks, and archive-aware', async () => fixture(f => {
  const { trade, scope, sale } = f
  const initial = trade.createContact({ ...scope, displayName: 'Supplier X', requestKey: 'contact-1' })
  assert.equal(trade.createContact({ ...scope, displayName: 'Supplier X', requestKey: 'contact-1' }).replayed, true)
  reject(() => trade.createContact({ ...scope, displayName: 'Supplier Y', requestKey: 'contact-1' }), 'CONFLICT')
  const renamed = trade.renameContact({ ...scope, contactId: initial.id, displayName: 'Supplier X Trading', expectedRevision: 1 })
  assert.equal(renamed.revision, 2)
  assert.equal(trade.getContact({ ...scope, contactId: initial.id }).displayName, 'Supplier X Trading')
  reject(() => trade.renameContact({ ...scope, contactId: initial.id, displayName: 'Wrong', expectedRevision: 1 }), 'CONFLICT')
  const archived = trade.setContactStatus({ ...scope, contactId: initial.id, status: 'archived' })
  assert.equal(archived.status, 'archived')
  reject(() => trade.createInvoice(sale('archived-party', { partyId: initial.id })), 'INVALID_INPUT')
  assert.equal(trade.createContact({ ...scope, displayName: 'Supplier X', requestKey: 'contact-1' }).id, initial.id)
}))

test('reader can inspect but cannot mutate or post trading documents', async () => fixture(async f => {
  const { identity, trade, scope, sale, receipt } = f
  const posted = trade.postInvoice({ ...scope, id: trade.createInvoice(sale('sale-1')).id })
  const user = await identity.createUser({ sessionToken: scope.sessionToken, username: 'reader', displayName: 'Reader', password })
  const role = identity.listRoles({ sessionToken: scope.sessionToken }).find(r => r.code === 'company-reader')!
  identity.assignRole({ sessionToken: scope.sessionToken, roleId: role.id, userId: user.id})
  const { token } = await identity.login({ username: 'reader', password })
  const asReader = { sessionToken: token, companyId: scope.companyId }
  assert.equal(trade.getInvoice({ ...asReader, invoiceId: posted.id }).status, 'posted')
  assert.equal(trade.listContacts(asReader).length, 1)
  reject(() => trade.createInvoice({ ...sale('reader-sale'), ...asReader }), 'PERMISSION_DENIED')
  reject(() => trade.postInvoice({ ...asReader, id: posted.id }), 'PERMISSION_DENIED')
  reject(() => trade.createPayment({ ...receipt('reader-receipt'), ...asReader }), 'PERMISSION_DENIED')
  reject(() => trade.createContact({ ...asReader, displayName: 'Unauthorized' }), 'PERMISSION_DENIED')
}))

test('allocations support multiple partial receipts; reversals preserve journal and audit trails', async () => fixture(f => {
  const { trade, accounting, scope, sale, receipt, db } = f
  const invoice = trade.postInvoice({ ...scope, id: trade.createInvoice(sale('sale-1')).id })
  const first = trade.postPayment({ ...scope, id: trade.createPayment(receipt('receipt-1', { amountMinor: '10000000' })).id })
  const second = trade.postPayment({ ...scope, id: trade.createPayment(receipt('receipt-2', { amountMinor: '50000000' })).id })
  trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: first.id, amountMinor: '10000000', requestKey: 'alloc-one' })
  trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: second.id, amountMinor: '40000000', requestKey: 'alloc-two' })
  assert.equal(trade.getInvoice({ ...scope, invoiceId: invoice.id }).outstandingMinor, '0')
  assert.equal(trade.getPayment({ ...scope, paymentId: second.id }).unallocatedMinor, '10000000')
  reject(() => trade.allocatePayment({ ...scope, invoiceId: invoice.id, paymentId: second.id, amountMinor: '1', requestKey: 'extra' }), 'CONFLICT')
  const allocations = trade.listAllocations({ ...scope, invoiceId: invoice.id })
  assert.equal(allocations.length, 2)
  const firstAllocation = allocations.find(a => a.paymentId === first.id)!
  const secondAllocation = allocations.find(a => a.paymentId === second.id)!
  trade.reverseAllocation({ ...scope, allocationId: firstAllocation.id, reason: 'Misapplied', requestKey: 'release-one' })
  assert.equal(trade.getInvoice({ ...scope, invoiceId: invoice.id }).outstandingMinor, '10000000')
  trade.reverseAllocation({ ...scope, allocationId: secondAllocation.id, reason: 'Return', requestKey: 'release-two' })
  const reversedInvoice = trade.reverseInvoice({ ...scope, id: invoice.id, reversedOn: '2026-11-18', reason: 'Cancelled invoice', requestKey: 'reverse-transaction' })
  const replay = trade.reverseInvoice({ ...scope, id: invoice.id, reversedOn: '2026-11-18', reason: 'Cancelled invoice', requestKey: 'reverse-transaction' })
  assert.equal(reversedInvoice.reversalJournalId, replay.reversalJournalId)
  assert.equal(replay.replayed, true)
  assert.equal(trade.getInvoice({ ...scope, invoiceId: invoice.id }).outstandingMinor, '0')
  reject(() => trade.reverseInvoice({ ...scope, id: invoice.id, reversedOn: '2026-11-19', reason: 'Changed', requestKey: 'reverse-transaction' }), 'CONFLICT')
  assert.equal(accounting.trialBalance(scope).totalDebitMinor, accounting.trialBalance(scope).totalCreditMinor)
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM security_audit WHERE action LIKE 'trade.%'").get()?.['n']) > 5, true)
}))

test('direct journal interface cannot impersonate invoice posting', async () => fixture(f => {
  const { accounting, scope, accounts, db } = f
  reject(() => accounting.postJournal({ ...scope, date: '2026-11-17', sourceType: 'trade.invoice', sourceId: 'forged', sourceEvent: 'post', idempotencyKey: 'forged', description: 'forged',
    lines: [{ accountId: accounts.ar, debitMinor: '100', creditMinor: '0' }, { accountId: accounts.revenue, debitMinor: '0', creditMinor: '100' }] }), 'INVALID_INPUT')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'], 0)
}))


test('a sales-only user can prepare a draft but cannot bypass accounting posting rights', async () => fixture(async f => {
  const { identity, trade, scope, sale, db } = f
  const user = await identity.createUser({ sessionToken: scope.sessionToken, username: 'clerk', displayName: 'Sales clerk', password })
  const role = identity.createRole({ sessionToken: scope.sessionToken, code: 'sales-clerk', name: 'Sales clerk',
    permissions: ['company.read', 'sales.read', 'sales.manage', 'contacts.read'] })
  identity.assignRole({ sessionToken: scope.sessionToken, roleId: role.id, userId: user.id})
  const { token } = await identity.login({ username: 'clerk', password })
  const clerkScope = { sessionToken: token, companyId: scope.companyId }
  const draft = trade.createInvoice({ ...sale('clerk-sale'), ...clerkScope })
  assert.equal(draft.status, 'draft')
  reject(() => trade.postInvoice({ ...clerkScope, id: draft.id }), 'PERMISSION_DENIED')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'], 0)
  assert.equal(trade.postInvoice({ ...scope, id: draft.id }).number, 'S-000001')
}))

test('single-action invoice and payment commands post atomically with consistent allocation', async () => fixture(f => {
  const { accounting, trade, scope, accounts, sale, receipt, db } = f
  accounting.configurePostingDefaults({ ...scope, receivablesId: accounts.ar, payablesId: accounts.ap,
    revenueId: accounts.revenue, expenseId: accounts.expense, cashId: accounts.bank })
  assert.deepEqual(accounting.getPostingDefaults(scope), { receivablesId: accounts.ar, payablesId: accounts.ap,
    revenueId: accounts.revenue, expenseId: accounts.expense, cashId: accounts.bank })
  const posted = trade.recordInvoice(sale('quick-sale'))
  assert.equal(posted.status, 'posted')
  assert.equal(posted.number, 'S-000001')
  assert.equal(trade.recordInvoice(sale('quick-sale')).id, posted.id)
  const result = trade.recordPayment({ ...receipt('quick-receipt'), invoiceId: posted.id, allocationMinor: '20000000' })
  assert.equal(result.payment.status, 'posted')
  assert.equal(result.payment.number, 'R-000001')
  assert.ok(result.allocation)
  assert.equal(trade.getInvoice({ ...scope, invoiceId: posted.id }).outstandingMinor, '30000000')
  assert.equal(trade.getPayment({ ...scope, paymentId: result.payment.id }).unallocatedMinor, '0')
  const replay = trade.recordPayment({ ...receipt('quick-receipt'), invoiceId: posted.id, allocationMinor: '20000000' })
  assert.equal(replay.payment.id, result.payment.id)
  assert.equal(replay.allocation?.id, result.allocation?.id)
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'], 2)
  assert.equal(checkDatabase(db).ok, true)
}))

test('failed composite posting does not leave partial payments, journals or audit events', async () => fixture(f => {
  const { trade, scope, sale, receipt, db } = f
  const other = trade.createContact({ ...scope, displayName: 'Different supplier', requestKey: 'other-party' })
  const posted = trade.recordInvoice(sale('composite-invoice', { partyId: other.id }))
  const before = db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n']
  const beforePayments = db.prepare('SELECT count(*) AS n FROM trade_payments').get()?.['n']
  const beforeAudit = db.prepare('SELECT count(*) AS n FROM security_audit').get()?.['n']
  // The payment is valid and gets posted inside the command; only the later allocation
  // fails because the invoice belongs to another contact. The outer transaction must
  // undo the newly created payment, its journal, and audit event.
  reject(() => trade.recordPayment({ ...receipt('rollback-receipt'), invoiceId: posted.id, allocationMinor: '100000' }), 'CONFLICT')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'], before)
  assert.equal(db.prepare('SELECT count(*) AS n FROM trade_payments').get()?.['n'], beforePayments)
  assert.equal(db.prepare('SELECT count(*) AS n FROM security_audit').get()?.['n'], beforeAudit)
  assert.equal(trade.getInvoice({ ...scope, invoiceId: posted.id }).outstandingMinor, posted.totalMinor)
}))
