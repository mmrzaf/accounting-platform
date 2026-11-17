import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAccountingService } from '../../src/modules/accounting/service.ts'
import { createTradingService } from '../../src/modules/trading/service.ts'
import { createAiService } from '../../src/modules/ai/service.ts'
import { AiError } from '../../src/modules/ai/errors.ts'
import { IdentityError } from '../../src/modules/identity/errors.ts'
import type { ToolCall } from '../../src/modules/ai/provider.ts'
import type { DatabaseSync } from 'node:sqlite'
const migrationDir = fileURLToPath(new URL('../../migrations/', import.meta.url))
const password = 'secret for the AI integration test suite'
const response = (content: string, calls: ToolCall[] = []) => ({
  choices: [{ message: { content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
})
const tool = (name: string, args: unknown): ToolCall => ({ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } })
function scripted(...steps: object[]) {
  const observed: { tools: string[]; messages: unknown[]; url: string }[] = []
  const queue: object[] = [...steps]
  let consumed = 0
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const urlText = String(url)
    assert.equal(urlText, 'https://model.example/v1/chat/completions')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sample-key')
    assert.equal(init?.redirect, 'error')
    const body = JSON.parse(String(init?.body)) as { tools?: { function: { name: string } }[]; messages: unknown[] }
    observed.push({ tools: (body.tools ?? []).map(t => t.function.name), messages: body.messages, url: urlText })
    const step = queue.shift()
    consumed++
    if (!step) throw new Error('Unscripted AI provider call')
    return new Response(JSON.stringify(step), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fetcher, observed, calls: () => consumed, enqueue: (...more: object[]) => queue.push(...more) }
}
async function fixture<T>(fn: (f: Awaited<ReturnType<typeof setup>>) => T | Promise<T>, fetcher: typeof fetch) {
  const db = openDatabase(':memory:')
  applyMigrations(db, migrationDir)
  try { return await fn(await setup(db, fetcher)) } finally { db.close() }
}
async function setup(db: DatabaseSync, fetcher: typeof fetch) {
  const identity = createIdentityService(db), accounting = createAccountingService(db), trade = createTradingService(db)
  const boot = await identity.bootstrapCompany({ name:'Assistant organization',adminUsername:'owner',adminDisplayName:'Owner',password })
  const { token } = await identity.login({ username:'owner',password })
  const scope = { sessionToken: token, companyId: boot.company.id }
  const masterKey = randomBytes(32)
  const ai = createAiService(db,{ masterKey, fetcher })
  accounting.setupBook({ ...scope, baseCurrency:'IRR',baseDecimals:0,timezone:'Asia/Tehran' })
  accounting.addPeriod({ ...scope, code:'2026',startsOn:'2026-01-01',endsOn:'2026-12-31' })
  const ar = accounting.createAccount({ ...scope,code:'ar',name:'Receivable',category:'asset' }).id
  const bank = accounting.createAccount({ ...scope,code:'bank',name:'Bank',category:'asset' }).id
  const revenue = accounting.createAccount({ ...scope,code:'revenue',name:'Sales',category:'revenue' }).id
  const ali = trade.createContact({ ...scope,displayName:'Ali' })
  ai.configureProvider({ sessionToken:token,baseUrl:'https://model.example/v1',model:'test-model',apiKey:'sample-key',supportsTools:true,enabled:true })
  return { db,identity,accounting,trade,ai,masterKey,boot,scope,accounts:{ar,bank,revenue},ali }
}
const run = (scope: {sessionToken:string;companyId:string}, message='help', executionMode: 'auto'|'review'='auto') => ({
  ...scope, message, executionMode, clientRequestId: randomUUID(),
})
const assertCode = (fn: () => unknown, code: string) => assert.throws(fn, e => (e instanceof AiError || e instanceof IdentityError) && e.code === code)

// These tests execute real application services and SQLite ledger effects; only provider I/O is faked.
test('provider secrets use authenticated encryption and cannot be viewed through configuration', async () => {
  const mock = scripted(response('Hello'))
  await fixture(f => {
    const { ai,db,scope } = f
    assert.deepEqual(ai.getProvider({ sessionToken: scope.sessionToken }), { baseUrl:'https://model.example/v1',model:'test-model',supportsTools:true,enabled:true,hasApiKey:true })
    const stored = db.prepare('SELECT encrypted_api_key FROM ai_provider_configs').get()?.['encrypted_api_key']
    assert.equal(typeof stored,'string')
    assert.equal(String(stored).includes('sample-key'), false)
    assert.match(String(stored), /^v1:/u)
    assert.deepEqual(ai.getPolicy(scope), { autoDrafts:true,autoPost:false })
    assert.equal(ai.listTurns(scope).length,0)
    assertCode(() => ai.configureProvider({ sessionToken:scope.sessionToken,baseUrl:'http://169.254.169.254/v1',model:'x',supportsTools:true,enabled:true }), 'INVALID_INPUT')
    assertCode(() => ai.configureProvider({ sessionToken:scope.sessionToken,baseUrl:'https://user:pass@model.example/v1',model:'x',supportsTools:true,enabled:true }), 'INVALID_INPUT')
    assert.equal(checkDatabase(db).ok,true)
  },mock.fetcher)
})

test('model searches contacts with a read-only tool then explains the result', async () => {
  const mock = scripted(response('', [tool('list_contacts',{})]), response('One matching contact: Ali.'))
  await fixture(async f => {
    const result = await f.ai.runTurn(run(f.scope,'Find Ali','review'))
    assert.equal(result.status,'completed')
    assert.match(result.reply ?? '',/Ali/u)
    assert.equal(result.action,null)
    assert.equal(mock.calls(),2)
    assert.ok(JSON.stringify(mock.observed[0]?.messages).includes('Base currency IRR'))
    assert.ok(mock.observed[1]?.messages.some(message => (message as { role?:string }).role === 'tool'))
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ai_actions').get()?.['n'],0)
  },mock.fetcher)
})

test('contact creation is autonomous only under signed-in user permissions and request idempotency', async () => {
  const mock = scripted(response('', [tool('create_contact',{ displayName:'Sara' })]))
  await fixture(async f => {
    const request = run(f.scope,'Create Sara')
    const first = await f.ai.runTurn(request)
    assert.equal(first.status,'completed')
    assert.equal(first.action?.state,'completed')
    assert.equal(first.action?.links.some(link => link.kind === 'contact'),true)
    const repeated = await f.ai.runTurn(request)
    assert.equal(repeated.id,first.id)
    assert.equal(mock.calls(),1)
    assert.equal(f.trade.listContacts(f.scope).filter(c=>c.displayName==='Sara').length,1)
    await assert.rejects(f.ai.runTurn({ ...request, message:'Different message' }), e => e instanceof AiError && e.code === 'CONFLICT')
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='ai.tool.execute'").get()?.['n'],1)
  },mock.fetcher)
})

test('posting requires approval by default, with exact preview and permission rechecks', async () => {
  const mock = scripted()
  await fixture(async f => {
    const draft = f.trade.createInvoice({ ...f.scope,kind:'sale',partyId:f.ali.id,issuedOn:'2026-11-17',controlAccountId:f.accounts.ar,
      description:'Sale',lines:[{itemKind:'service',description:'Consulting',quantity:'1',unitPriceMinor:'1500',accountId:f.accounts.revenue}],requestKey:'manual-draft' })
    mock.enqueue(response('', [tool('post_invoice',{ invoiceId:draft.id })]))
    const proposal = await f.ai.runTurn(run(f.scope,'Post the sale invoice','auto'))
    assert.equal(proposal.status,'awaiting_approval')
    assert.equal(proposal.action?.state,'awaiting_approval')
    assert.equal(proposal.action?.preview.title,'Post invoice')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
    assertCode(() => f.ai.approveAction({ ...f.scope,actionId:proposal.action!.id,expectedFingerprint:'wrong' }), 'CONFLICT')
    const confirmed = f.ai.approveAction({ ...f.scope,actionId:proposal.action!.id,expectedFingerprint:proposal.action!.fingerprint })
    assert.equal((confirmed as {status:string}).status,'posted')
    assert.equal(f.trade.getInvoice({ ...f.scope,invoiceId:draft.id }).status,'posted')
    assert.equal(f.accounting.trialBalance(f.scope).totalDebitMinor,'1500')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],1)
    assertCode(() => f.ai.approveAction({ ...f.scope,actionId:proposal.action!.id,expectedFingerprint:proposal.action!.fingerprint }), 'INVALID_STATE')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],1)
  },mock.fetcher)
})

test('company policy permits an explicit auto-post; rejection performs no financial mutation', async () => {
  const mock = scripted()
  await fixture(async f => {
    const invoice = f.trade.createInvoice({ ...f.scope,kind:'sale',partyId:f.ali.id,issuedOn:'2026-11-17',controlAccountId:f.accounts.ar,
      description:'Sale',lines:[{itemKind:'service',description:'Consulting',quantity:'1',unitPriceMinor:'2500',accountId:f.accounts.revenue}],requestKey:'auto-draft' })
    f.ai.setPolicy({ ...f.scope,autoDrafts:true,autoPost:true })
    mock.enqueue(response('',[tool('post_invoice',{invoiceId:invoice.id})]))
    const completed = await f.ai.runTurn(run(f.scope,'Post the sale','auto'))
    assert.equal(completed.status,'completed')
    assert.equal(completed.action?.state,'completed')
    assert.equal(completed.action?.links.some(link => link.kind === 'invoice' && link.id === invoice.id),true)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],1)
    mock.enqueue(response('',[tool('create_contact',{displayName:'Never Created'})]))
    const review = await f.ai.runTurn(run(f.scope,'Create a contact','review'))
    assert.equal(review.status,'awaiting_approval')
    assert.equal(f.ai.rejectAction({ ...f.scope,actionId:review.action!.id,expectedFingerprint:review.action!.fingerprint }).state,'rejected')
    assert.equal(f.trade.listContacts(f.scope).some(c=>c.displayName==='Never Created'),false)
    assertCode(() => f.ai.approveAction({ ...f.scope,actionId:review.action!.id,expectedFingerprint:review.action!.fingerprint }),'INVALID_STATE')
  },mock.fetcher)
})

test('read-only roles cannot receive mutating tools or approve somebody else’s action', async () => {
  const mock = scripted()
  await fixture(async f => {
    const { identity, scope } = f
    const reader = await identity.createUser({ sessionToken:scope.sessionToken,username:'reader',displayName:'Reader',password })
    const role = identity.listRoles({ sessionToken:scope.sessionToken }).find(r=>r.code==='company-reader')!
    identity.assignRole({ sessionToken:scope.sessionToken,userId:reader.id,roleId:role.id})
    const { token } = await identity.login({ username:'reader',password })
    const readScope = { sessionToken:token,companyId:scope.companyId }
    mock.enqueue(response('Read-only answer'))
    const reply = await f.ai.runTurn(run(readScope,'Can I list contacts?'))
    assert.equal(reply.status,'completed')
    assert.equal(mock.observed[0]?.tools.includes('create_contact'),false)
    assert.equal(mock.observed[0]?.tools.includes('post_invoice'),false)
    mock.enqueue(response('',[tool('create_contact',{displayName:'Escalation'})]))
    await assert.rejects(f.ai.runTurn(run(readScope,'Try to create contact')),e=>e instanceof AiError && e.code==='PROVIDER_RESPONSE_INVALID')
    assert.equal(f.trade.listContacts(scope).some(c=>c.displayName==='Escalation'),false)
    mock.enqueue(response('',[tool('create_contact',{displayName:'Owner Pending'})]))
    const pending = await f.ai.runTurn(run(scope,'Create an owner contact','review'))
    assert.equal(pending.status,'awaiting_approval')
    assertCode(() => f.ai.approveAction({ ...readScope,actionId:pending.action!.id,expectedFingerprint:pending.action!.fingerprint }),'PERMISSION_DENIED')
    assert.equal(f.trade.listContacts(scope).some(c=>c.displayName==='Owner Pending'),false)
  },mock.fetcher)
})

test('cross-company isolation is fail-closed', async () => {
  const mock = scripted(response('',[tool('create_contact',{displayName:'Pending'})]))
  await fixture(async f => {
    const later = await f.identity.bootstrapCompany({name:'Company B',adminUsername:'company-b-owner',adminDisplayName:'Owner',password})
    const proposal = await f.ai.runTurn(run(f.scope,'Add pending contact','review'))
    assert.equal(proposal.status,'awaiting_approval')
    assertCode(() => f.ai.getTurn({ ...f.scope,companyId:later.company.id,turnId:proposal.id }),'NOT_FOUND')
    assertCode(() => f.ai.approveAction({ ...f.scope,companyId:later.company.id,actionId:proposal.action!.id,expectedFingerprint:proposal.action!.fingerprint }),'NOT_FOUND')
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM contacts WHERE display_name=\'Pending\'").get()?.['n'],0)
  },mock.fetcher)
})

test('disabled provider, no-tool endpoint and malformed provider outputs fail safely', async () => {
  const mock = scripted(response('Read-only provider answer.'))
  await fixture(async f => {
    f.ai.configureProvider({ sessionToken:f.scope.sessionToken,baseUrl:'https://model.example/v1',model:'text-only',supportsTools:false,enabled:true })
    const answer = await f.ai.runTurn(run(f.scope,'Help me understand accounting','review'))
    assert.equal(answer.status,'completed')
    assert.equal(mock.observed[0]?.tools.length,0)
    f.ai.configureProvider({ sessionToken:f.scope.sessionToken,baseUrl:'https://model.example/v1',model:'text-only',supportsTools:false,enabled:false })
    await assert.rejects(f.ai.runTurn(run(f.scope)),e => e instanceof AiError && e.code === 'CONFIGURATION_REQUIRED')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
  },mock.fetcher)
})

test('invalid model arguments never produce a proposal or business mutation', async () => {
  const mock = scripted(response('',[tool('create_invoice',{ kind:'sale',partyId:'made-up',issuedOn:'yesterday' })]))
  await fixture(async f => {
    const input = run(f.scope,'Create an invoice')
    await assert.rejects(f.ai.runTurn(input),e=>e instanceof AiError && e.code==='PROVIDER_RESPONSE_INVALID')
    const replay = await f.ai.runTurn(input)
    assert.equal(replay.status,'failed')
    assert.equal(mock.calls(),1)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ai_actions').get()?.['n'],0)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trade_invoices').get()?.['n'],0)
  },mock.fetcher)
})

test('financial validation failure rolls back AI action and accounting effects atomically', async () => {
  const badAccount = randomUUID()
  const mock = scripted()
  await fixture(async f => {
    mock.enqueue(response('',[tool('create_invoice',{ kind:'sale',partyId:f.ali.id,issuedOn:'2026-11-17',controlAccountId:f.accounts.ar,
      description:'Invalid account', lines:[{itemKind:'service',description:'Something',quantity:'1',unitPriceMinor:'100',accountId:badAccount}] })]))
    const input = run(f.scope,'Create invoice with missing account')
    await assert.rejects(f.ai.runTurn(input))
    const final = await f.ai.runTurn(input)
    assert.equal(final.status,'failed')
    assert.equal(final.action?.state,'failed')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM trade_invoices').get()?.['n'],0)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='ai.tool.failed'").get()?.['n'],1)
    assert.equal(checkDatabase(f.db).ok,true)
  },mock.fetcher)
})

test('proposal approvals expire after fifteen minutes', async () => {
  const mock = scripted(response('',[tool('create_contact',{displayName:'Too late'})]))
  await fixture(async f => {
    const stamp = new Date('2026-11-17T00:00:00.000Z').getTime()
    let elapsed = 0
    const ai = createAiService(f.db,{masterKey:f.masterKey,fetcher:mock.fetcher,clock:()=>new Date(stamp+elapsed)})
    const turn = await ai.runTurn(run(f.scope,'Create contact','review'))
    assert.equal(turn.status,'awaiting_approval')
    elapsed=16*60*1000
    assertCode(()=>ai.approveAction({...f.scope,actionId:turn.action!.id,expectedFingerprint:turn.action!.fingerprint}),'INVALID_STATE')
    assert.equal(f.trade.listContacts(f.scope).some(c=>c.displayName==='Too late'),false)
  },mock.fetcher)
})

test('AI actions and provider settings cannot cross organization boundaries', async () => {
  const mock = scripted(response('',[tool('create_contact',{displayName:'Scoped contact'})]))
  await fixture(async f => {
    const another = await f.identity.bootstrapCompany({name:'Another',adminUsername:'another',adminDisplayName:'Another',password})
    const {token} = await f.identity.login({username:'another',password})
    assert.equal(f.ai.getProvider({sessionToken:token}),null)
    const pending = await f.ai.runTurn(run(f.scope,'Create contact','review'))
    assertCode(()=>f.ai.getTurn({sessionToken:token,companyId:another.company.id,turnId:pending.id}),'INVALID_STATE')
    assertCode(()=>f.ai.approveAction({sessionToken:token,companyId:another.company.id,actionId:pending.action!.id,expectedFingerprint:pending.action!.fingerprint}),'INVALID_STATE')
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM contacts WHERE display_name='Scoped contact'").get()?.['n'],0)
  },mock.fetcher)
})

test('revoking company role between proposal and approval prevents execution', async () => {
  const mock = scripted(response('',[tool('create_contact',{displayName:'Blocked by revocation'})]))
  await fixture(async f => {
    const turn = await f.ai.runTurn(run(f.scope,'Create contact','review'))
    const grants = f.identity.listAssignments({sessionToken:f.scope.sessionToken,userId:f.boot.administrator.id})
    const companyGrant = grants.find(g=>g.role_code==='company-admin')!
    const adminRole=f.identity.listRoles({sessionToken:f.scope.sessionToken}).find(r=>r.code==='company-admin')!
    const backupAdmin=await f.identity.createUser({sessionToken:f.scope.sessionToken,username:'backup-admin',displayName:'Backup Admin',password})
    f.identity.assignRole({sessionToken:f.scope.sessionToken,userId:backupAdmin.id,roleId:adminRole.id})
    f.identity.revokeRole({sessionToken:f.scope.sessionToken,assignmentId:companyGrant.id})
    assert.throws(()=>f.ai.approveAction({...f.scope,actionId:turn.action!.id,expectedFingerprint:turn.action!.fingerprint}),
      e=>e instanceof IdentityError && ['NOT_FOUND','PERMISSION_DENIED'].includes(e.code))
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM contacts WHERE display_name='Blocked by revocation'").get()?.['n'],0)
  },mock.fetcher)
})

test('provider outages do not retry or insert financial actions and do not expose error bodies', async () => {
  const fetcher = (async () => new Response('my private provider debugging details',{status:503})) as typeof fetch
  await fixture(async f => {
    const input = run(f.scope,'Find my invoices')
    await assert.rejects(f.ai.runTurn(input),e=>e instanceof AiError && e.code==='PROVIDER_UNAVAILABLE' && !e.message.includes('private'))
    assert.equal((await f.ai.runTurn(input)).status,'failed')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ai_actions').get()?.['n'],0)
  },fetcher)
})

test('bounded AI request rate limiting rejects excess calls without contacting provider', async () => {
  const mock = scripted(...Array.from({length:20},()=>response('Ok')))
  await fixture(async f => {
    for (let i=0;i<20;i++) assert.equal((await f.ai.runTurn(run(f.scope,`Question ${i}`,'review'))).status,'completed')
    await assert.rejects(f.ai.runTurn(run(f.scope,'Too many requests','review')),
      e=>e instanceof AiError && e.code==='RATE_LIMITED')
    assert.equal(mock.calls(),20)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ai_turns').get()?.['n'],20)
  },mock.fetcher)
})

test('financial read tools derive exact trial balances from the accounting engine', async () => {
  const mock = scripted(response('',[tool('trial_balance',{})]),response('The ledger balances.'))
  await fixture(async f => {
    const draft = f.trade.createInvoice({ ...f.scope,kind:'sale',partyId:f.ali.id,issuedOn:'2026-11-17',controlAccountId:f.accounts.ar,
      description:'Reportable sale',lines:[{itemKind:'service',description:'Consulting',quantity:'1',unitPriceMinor:'7654321',accountId:f.accounts.revenue}],requestKey:'report-balance' })
    f.trade.postInvoice({...f.scope,id:draft.id})
    const answer = await f.ai.runTurn(run(f.scope,'Explain my ledger balance','review'))
    assert.equal(answer.status,'completed')
    const messages = mock.observed[1]?.messages as {role:string;content:string}[]
    const result = JSON.parse(messages.find(m=>m.role==='tool')!.content) as {totalDebitMinor:string;totalCreditMinor:string}
    assert.equal(result.totalDebitMinor,'7654321')
    assert.equal(result.totalCreditMinor,'7654321')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ai_actions').get()?.['n'],0)
  },mock.fetcher)
})

// Milestone 4 contract cases. Authored but intentionally not run until Milestone 5.
test('persistent user conversation provides verified record references to a follow-up turn', async () => {
  const mock = scripted(response('', [tool('create_contact',{ displayName:'Followup counterparty' })]))
  await fixture(async f => {
    const first = await f.ai.runTurn(run(f.scope,'Add a contact named Followup counterparty','auto'))
    const conversationId = first.conversationId
    assert.equal(first.action?.state,'completed')
    const contactLink = first.action?.links.find(link => link.kind === 'contact')
    assert.ok(contactLink)
    const history = f.ai.getConversation({ ...f.scope, conversationId })
    assert.equal(history.turns.length,1)
    assert.equal(history.turns[0]?.message,'Add a contact named Followup counterparty')
    mock.enqueue(response('That contact is saved in the current company.'))
    const next = await f.ai.runTurn({...run(f.scope,'What contact did you just create?','review'),conversationId})
    assert.equal(next.status,'completed')
    assert.equal(f.ai.getConversation({...f.scope,conversationId}).turns.length,2)
    const context = JSON.stringify(mock.observed[1]?.messages)
    assert.ok(context.includes(contactLink.id))
    assert.ok(context.includes('Previously completed operation record references'))
    const items = f.ai.listConversations(f.scope)
    assert.equal(items[0]?.id,conversationId)
  }, mock.fetcher)
})

test('single AI compound trade command posts invoice and partial receipt atomically', async () => {
  const mock=scripted()
  await fixture(async f => {
    const ap=f.accounting.createAccount({...f.scope,code:'payables',name:'Payables',category:'liability'}).id
    const expenses=f.accounting.createAccount({...f.scope,code:'expenses',name:'Expenses',category:'expense'}).id
    f.accounting.configurePostingDefaults({...f.scope,receivablesId:f.accounts.ar,payablesId:ap,
      revenueId:f.accounts.revenue,expenseId:expenses,cashId:f.accounts.bank})
    f.ai.setPolicy({...f.scope,autoDrafts:true,autoPost:true})
    mock.enqueue(response('',[tool('record_trade',{
      kind:'sale',partyId:f.ali.id,issuedOn:'2026-11-17',description:'Twenty service units',
      expectedTotalMinor:'50000000',paidMinor:'20000000',paidOn:'2026-11-17',
      lines:[{itemKind:'service',description:'Service unit',quantity:'20',unitPriceMinor:'2500000'}],
    })]))
    const result=await f.ai.runTurn(run(f.scope,'Sell 20 units for 50,000,000, receive 20,000,000','auto'))
    assert.equal(result.status,'completed')
    assert.equal(result.action?.state,'completed')
    assert.equal(result.action?.preview.totalMinor,'50000000')
    assert.equal(result.action?.preview.paymentMinor,'20000000')
    assert.equal(result.action?.preview.outstandingMinor,'30000000')
    const invoice=result.action?.links.find(link=>link.kind==='invoice')
    const payment=result.action?.links.find(link=>link.kind==='payment')
    assert.ok(invoice)
    assert.ok(payment)
    assert.equal(f.trade.getInvoice({...f.scope,invoiceId:invoice.id}).outstandingMinor,'30000000')
    assert.equal(f.trade.getPayment({...f.scope,paymentId:payment.id}).unallocatedMinor,'0')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],2)
    assert.equal(f.accounting.trialBalance(f.scope).totalDebitMinor,f.accounting.trialBalance(f.scope).totalCreditMinor)
  },mock.fetcher)
})
