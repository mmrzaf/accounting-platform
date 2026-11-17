import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, checkDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { IdentityError } from '../../src/modules/identity/errors.ts'
import { createAccountingService } from '../../src/modules/accounting/service.ts'
import { AccountingError } from '../../src/modules/accounting/errors.ts'
import type { JournalLineInput, PostJournalInput } from '../../src/modules/accounting/types.ts'

const migrationDir = fileURLToPath(new URL('../../migrations/', import.meta.url))
const password='a long password for accounting tests'
const fail=(fn:()=>unknown,code:string) => assert.throws(fn,err=>err instanceof AccountingError && err.code===code)
const deny=(fn:()=>unknown,code:string) => assert.throws(fn,err=>err instanceof IdentityError && err.code===code)

async function fixture<T>(fn:(state:Awaited<ReturnType<typeof prepareFixture>>)=>T|Promise<T>, path=':memory:'):Promise<T> {
  const db=openDatabase(path)
  applyMigrations(db,migrationDir)
  const state=await prepareFixture(db)
  try{return await fn(state)}finally{db.close()}
}
async function prepareFixture(db:DatabaseSync) {
  const identity=createIdentityService(db),accounting=createAccountingService(db)
  const boot=await identity.bootstrapCompany({name:'ACME',adminUsername:'owner',adminDisplayName:'Owner',password})
  const {token}=await identity.login({username:'owner',password})
  const scoped={sessionToken:token,companyId:boot.company.id}
  accounting.setupBook({...scoped,baseCurrency:'IRR',baseDecimals:0,timezone:'Asia/Tehran'})
  accounting.addPeriod({...scoped,code:'1405',startsOn:'2026-03-21',endsOn:'2027-03-20'})
  const cash=accounting.createAccount({...scoped,code:'cash',name:'Cash',category:'asset'})
  const receivable=accounting.createAccount({...scoped,code:'receivable',name:'Receivable',category:'asset'})
  const income=accounting.createAccount({...scoped,code:'income',name:'Revenue',category:'revenue'})
  const expense=accounting.createAccount({...scoped,code:'expense',name:'Expense',category:'expense'})
  const payable=accounting.createAccount({...scoped,code:'payable',name:'Payable',category:'liability'})
  const equity=accounting.createAccount({...scoped,code:'equity',name:'Equity',category:'equity'})
  const accounts={cash,receivable,income,expense,payable,equity}
  const post=(name:string,lines:JournalLineInput[],overrides:Partial<PostJournalInput>={})=>accounting.postJournal({...scoped,date:'2026-11-17',sourceType:'manual',sourceId:name,sourceEvent:'post',idempotencyKey:name,description:name,lines,...overrides})
  return {db,identity,accounting,boot,token,scoped,accounts,post}
}
const debit=(id:string,amount:string):JournalLineInput=>({accountId:id,debitMinor:amount,creditMinor:'0'})
const credit=(id:string,amount:string):JournalLineInput=>({accountId:id,debitMinor:'0',creditMinor:amount})

test('book setup, period and hierarchical chart have scoped constraints',async()=>fixture(({accounting,scoped,accounts,db})=>{
  assert.equal(accounting.getBook(scoped).base_currency,'IRR')
  assert.equal(accounting.listCurrencies(scoped)[0]?.decimals,0)
  fail(()=>accounting.setupBook({...scoped,baseCurrency:'USD',baseDecimals:2,timezone:'UTC'}),'CONFLICT')
  fail(()=>accounting.addPeriod({...scoped,code:'overlap',startsOn:'2026-11-01',endsOn:'2027-01-01'}),'CONFLICT')
  fail(()=>accounting.addPeriod({...scoped,code:'inverted',startsOn:'2027-04-01',endsOn:'2027-03-01'}),'INVALID_INPUT')
  const parent=accounting.createAccount({...scoped,code:'a',name:'Assets',category:'asset',postable:false})
  const child=accounting.createAccount({...scoped,code:'child',name:'Cash subledger',category:'asset',parentId:parent.id})
  assert.equal(child.parentId,parent.id)
  fail(()=>accounting.createAccount({...scoped,code:'wrong',name:'Wrong',category:'expense',parentId:parent.id}),'INVALID_INPUT')
  fail(()=>accounting.createAccount({...scoped,code:'bad',name:'Wrong',category:'asset',parentId:accounts.cash.id}),'INVALID_INPUT')
  fail(()=>accounting.createAccount({...scoped,code:'cash',name:'Duplicate',category:'asset'}),'CONFLICT')
  fail(()=>accounting.setAccountActive({...scoped,accountId:parent.id,active:false}),'CONFLICT')
  assert.throws(()=>db.prepare('UPDATE accounting_books SET base_currency=?').run('USD'),/immutable/u)
  assert.throws(()=>db.prepare('UPDATE ledger_accounts SET category=? WHERE id=?').run('liability',accounts.cash.id),/immutable/u)
  assert.equal(checkDatabase(db).ok,true)
}))

test('posting is exact, idempotent, balanced, and reports are ledger-derived',async()=>fixture(({accounting,scoped,accounts,db,post})=>{
  const first=post('sale-a',[debit(accounts.receivable.id,'5000000000'),credit(accounts.income.id,'5000000000')])
  assert.equal(first.replayed,false)
  assert.equal(first.lines[0]?.debitMinor,'5000000000')
  const duplicate=post('sale-a',[debit(accounts.receivable.id,'5000000000'),credit(accounts.income.id,'5000000000')])
  assert.equal(duplicate.id,first.id)
  assert.equal(duplicate.replayed,true)
  fail(()=>post('sale-a',[debit(accounts.receivable.id,'400'),credit(accounts.income.id,'400')]),'CONFLICT')
  fail(()=>post('sale-b',[debit(accounts.receivable.id,'100'),credit(accounts.income.id,'100')],{sourceId:'sale-a'}),'CONFLICT')
  fail(()=>post('unequal',[debit(accounts.cash.id,'3'),credit(accounts.income.id,'2')]),'UNBALANCED')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],1)
  assert.equal(accounting.getJournal({...scoped,journalId:first.id}).sourceId,'sale-a')
  const receipt=post('receipt-a',[debit(accounts.cash.id,'2000000000'),credit(accounts.receivable.id,'2000000000')])
  assert.notEqual(receipt.id,first.id)
  const balance=accounting.trialBalance(scoped)
  assert.equal(balance.totalDebitMinor,'5000000000')
  assert.equal(balance.totalCreditMinor,'5000000000')
  assert.equal(balance.rows.find(r=>r.code==='receivable')?.netDebitMinor,'3000000000')
  const statement=accounting.financialSummary(scoped)
  assert.equal(statement.assetsMinor,'5000000000')
  assert.equal(statement.netIncomeMinor,'5000000000')
  const ledger=accounting.generalLedger({...scoped,accountId:accounts.receivable.id})
  assert.equal(ledger.rows.length,2)
  assert.equal(ledger.closingNetDebitMinor,'3000000000')
  const paged=accounting.generalLedger({...scoped,accountId:accounts.receivable.id,limit:1,offset:1})
  assert.equal(paged.rows.length,1)
  assert.equal(paged.rows[0]?.balanceMinor,'3000000000')
}))

test('numeric sums larger than int64 and MAX_SAFE_INTEGER remain exactly balanced',async()=>fixture(({post,accounts,accounting,scoped})=>{
  const big='9007199254740993'
  post('large-a',[debit(accounts.cash.id,big),credit(accounts.equity.id,big)])
  post('large-b',[debit(accounts.cash.id,big),credit(accounts.equity.id,big)])
  const tb=accounting.trialBalance(scoped)
  assert.equal(tb.totalDebitMinor,'18014398509481986')
  assert.equal(tb.totalCreditMinor,'18014398509481986')
  const summary=accounting.financialSummary(scoped)
  assert.equal(summary.assetsMinor,'18014398509481986')
  assert.equal(summary.equityMinor,'18014398509481986')
  const nearMax='9223372036854775807'
  post('max-a',[debit(accounts.cash.id,nearMax),credit(accounts.equity.id,nearMax)])
  assert.equal(accounting.trialBalance(scoped).totalDebitMinor,(18014398509481986n+BigInt(nearMax)).toString())
}))

test('posted journals and journal lines are immutable, no direct unbalanced transition',async()=>fixture(({post,accounts,db})=>{
  const entry=post('immutable',[debit(accounts.cash.id,'100'),credit(accounts.equity.id,'100')])
  assert.throws(()=>db.prepare('UPDATE journal_lines SET debit_minor=? WHERE journal_id=?').run(99,entry.id),/immutable/u)
  assert.throws(()=>db.prepare('DELETE FROM journal_lines WHERE journal_id=?').run(entry.id),/cannot be deleted/u)
  assert.throws(()=>db.prepare('DELETE FROM journal_entries WHERE id=?').run(entry.id),/cannot be deleted/u)
  assert.throws(()=>db.prepare('UPDATE journal_entries SET description=? WHERE id=?').run('edited',entry.id),/immutable/u)
  assert.throws(()=>db.prepare(`INSERT INTO journal_lines(id,journal_id,company_id,line_no,account_id,debit_minor,credit_minor,currency,transaction_minor)
      VALUES(?,?,?,?,?,?,?,?,?)`).run('not-uuid',entry.id,entry.companyId,3,accounts.cash.id,100,0,'IRR',100),/Cannot add lines/u)
}))

test('closed fiscal period blocks new journals; audited reversal posts into open period',async()=>fixture(({accounting,scoped,post,accounts,db})=>{
  const posted=post('initial',[debit(accounts.cash.id,'135'),credit(accounts.equity.id,'135')])
  const period=accounting.listPeriods(scoped)[0]!
  const close=accounting.setPeriodStatus({...scoped,periodId:period.id,status:'closed'})
  assert.equal(close.changed,true)
  fail(()=>post('another',[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')]),'PERIOD_CLOSED')
  const replay=post('initial',[debit(accounts.cash.id,'135'),credit(accounts.equity.id,'135')])
  assert.equal(replay.id,posted.id)
  const second=accounting.addPeriod({...scoped,code:'1406',startsOn:'2027-03-21',endsOn:'2028-03-19'})
  const reversed=accounting.reverseJournal({...scoped,journalId:posted.id,date:'2027-03-22',idempotencyKey:'reverse-1',reason:'Correction of prior-period entry'})
  assert.equal(reversed.reversesId,posted.id)
  assert.equal(reversed.periodId,second.id)
  assert.equal(accounting.reverseJournal({...scoped,journalId:posted.id,date:'2027-03-22',idempotencyKey:'reverse-1',reason:'Correction of prior-period entry'}).replayed,true)
  fail(()=>accounting.reverseJournal({...scoped,journalId:posted.id,date:'2027-03-22',idempotencyKey:'reverse-2',reason:'Different'}),'CONFLICT')
  fail(()=>accounting.reverseJournal({...scoped,journalId:reversed.id,date:'2027-03-22',idempotencyKey:'reverse-3',reason:'Try to undo reversal'}),'INVALID_INPUT')
  assert.equal(accounting.trialBalance(scoped).totalDebitMinor,'0')
  assert.equal(accounting.financialSummary(scoped).assetsMinor,'0')
  assert.equal(accounting.trialBalance({...scoped,through:'2026-11-17'}).totalDebitMinor,'135')
  assert.equal(db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='accounting.journal.reverse'").get()?.['n'],1)
  assert.equal(accounting.setPeriodStatus({...scoped,periodId:period.id,status:'open'}).changed,true)
  assert.equal(accounting.setPeriodStatus({...scoped,periodId:period.id,status:'open'}).changed,false)
}))

test('multi-currency snapshots are validated, locked and displayed independently',async()=>fixture(({accounting,scoped,post,accounts})=>{
  accounting.addCurrency({...scoped,code:'USD',decimals:2,name:'US Dollar'})
  assert.equal(accounting.listCurrencies(scoped).length,2)
  const foreign={currency:'USD',amountMinor:'500',rate:{numerator:'50000',denominator:'1',date:'2026-11-16',source:'manual-bank-quotation'}}
  const entry=post('fx',[{...debit(accounts.cash.id,'25000000'),foreign},credit(accounts.equity.id,'25000000')])
  assert.equal(entry.lines[0]?.currency,'USD')
  assert.equal(entry.lines[0]?.transactionMinor,'500')
  assert.deepEqual(entry.lines[0]?.rate,foreign.rate)
  fail(()=>post('badfx',[{...debit(accounts.cash.id,'24999999'),foreign},credit(accounts.equity.id,'24999999')]),'INVALID_INPUT')
  fail(()=>post('unknown',[{...debit(accounts.cash.id,'25000000'),foreign:{...foreign,currency:'GBP'}},credit(accounts.equity.id,'25000000')]),'INVALID_INPUT')
  const reversed=accounting.reverseJournal({...scoped,journalId:entry.id,date:'2026-11-18',idempotencyKey:'fx-reverse',reason:'Reverse foreign transaction'})
  assert.deepEqual(reversed.lines[0]?.rate,foreign.rate)
  assert.equal(reversed.lines[0]?.creditMinor,'25000000')
  assert.equal(accounting.financialSummary(scoped).assetsMinor,'0')
}))

test('cross-organization and cross-company records are invisible and unpostable',async()=>fixture(async({db,identity,accounting,scoped,accounts,post})=>{
  const other=await identity.bootstrapCompany({name:'Other',adminUsername:'other-owner',adminDisplayName:'Owner',password})
  const otherSession=await identity.login({username:'other-owner',password})
  const foreignScope={sessionToken:otherSession.token,companyId:other.company.id}
  accounting.setupBook({...foreignScope,baseCurrency:'USD',baseDecimals:2,timezone:'UTC'})
  accounting.addPeriod({...foreignScope,code:'y2026',startsOn:'2026-01-01',endsOn:'2026-12-31'})
  const foreignAccount=accounting.createAccount({...foreignScope,code:'cash',name:'Cash',category:'asset'})
  deny(()=>accounting.trialBalance({...foreignScope,companyId:scoped.companyId}),'NOT_FOUND')
  deny(()=>accounting.getBook({...scoped,companyId:other.company.id}),'NOT_FOUND')
  fail(()=>post('wrong-account',[debit(foreignAccount.id,'50'),credit(accounts.equity.id,'50')]),'NOT_FOUND')
  // A session cannot access a different company's book, even without a book there.
  deny(()=>accounting.getBook({sessionToken:scoped.sessionToken,companyId:other.company.id}),'NOT_FOUND')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
}))

test('reader cannot post, configure, reverse or close, even using existing session',async()=>fixture(async({identity,accounting,scoped,accounts,post})=>{
  const staff=await identity.createUser({sessionToken:scoped.sessionToken,username:'reader',displayName:'Reader',password})
  const role=identity.listRoles({sessionToken:scoped.sessionToken}).find(x=>x.code==='company-reader')!
  identity.assignRole({sessionToken:scoped.sessionToken,userId:staff.id,roleId:role.id})
  const session=await identity.login({username:'reader',password})
  const asReader={sessionToken:session.token,companyId:scoped.companyId}
  assert.equal(accounting.trialBalance(asReader).baseCurrency,'IRR')
  deny(()=>accounting.createAccount({...asReader,code:'evil',name:'Unauthorized',category:'asset'}),'PERMISSION_DENIED')
  deny(()=>accounting.setPeriodStatus({...asReader,periodId:accounting.listPeriods(scoped)[0]!.id,status:'closed'}),'PERMISSION_DENIED')
  deny(()=>accounting.postJournal({...asReader,date:'2026-11-17',sourceType:'manual',sourceId:'evil',sourceEvent:'post',idempotencyKey:'evil',description:'Unauthorized',lines:[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')]}),'PERMISSION_DENIED')
  const posted=post('authorized',[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')])
  deny(()=>accounting.reverseJournal({...asReader,journalId:posted.id,date:'2026-11-18',idempotencyKey:'reverse-unauthorized',reason:'Unapproved'}),'PERMISSION_DENIED')
}))

test('transaction rollback and posting trigger prevent staging and invalid mutations',async()=>fixture(({db,scoped,accounting,accounts,post})=>{
  fail(()=>post('unbalanced',[debit(accounts.cash.id,'999'),credit(accounts.equity.id,'998')]),'UNBALANCED')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
  assert.equal(db.prepare('SELECT count(*) AS n FROM security_audit WHERE action=?').get('accounting.journal.post')?.['n'],0)
  fail(()=>accounting.postWithinTransaction({...scoped,date:'2026-11-17',sourceType:'manual',sourceId:'unsafe',sourceEvent:'post',idempotencyKey:'unsafe',description:'no transaction',lines:[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')]}),'INVALID_INPUT')
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
  const period=accounting.listPeriods(scoped)[0]!
  const uid='00000000-0000-4000-8000-000000000009'
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`INSERT INTO journal_entries(id,company_id,period_id,posted_on,source_type,source_id,source_event,idempotency_key,fingerprint,description,base_currency,posted_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid,scoped.companyId,period.id,'2026-11-17','manual','manual-failure','post','manual-failure','fingerprint','bad','IRR',String(db.prepare('SELECT id FROM users LIMIT 1').get()?.['id']))
    const insert=db.prepare(`INSERT INTO journal_lines(id,journal_id,company_id,line_no,account_id,debit_minor,credit_minor,currency,transaction_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
    insert.run('00000000-0000-4000-8000-000000000001',uid,scoped.companyId,1,accounts.cash.id,5n,0n,'IRR',5n)
    insert.run('00000000-0000-4000-8000-000000000002',uid,scoped.companyId,2,accounts.equity.id,0n,4n,'IRR',4n)
    assert.throws(()=>db.prepare('UPDATE journal_entries SET status=? WHERE id=?').run('posted',uid),/Unbalanced journal/u)
  } finally {db.exec('ROLLBACK')}
  assert.equal(checkDatabase(db).ok,true)
}))

test('separate database connections serialize competing writes and reject source duplicates',async()=>{
  const root=mkdtempSync(join(tmpdir(),'accounting-concurrent-'))
  const path=join(root,'ledger.sqlite')
  try {
    await fixture(({scoped,accounts,post})=>{
      const first=post('idempotent-a',[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')])
      assert.equal(first.replayed,false)
      const secondDb=openDatabase(path)
      try {
        const second=createAccountingService(secondDb)
        const alternate=second.postJournal({...scoped,date:'2026-11-17',sourceType:'manual',sourceId:'idempotent-a',sourceEvent:'post',idempotencyKey:'idempotent-a',description:'idempotent-a',lines:[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')]})
        assert.equal(alternate.id,first.id)
        assert.equal(alternate.replayed,true)
        fail(()=>second.postJournal({...scoped,date:'2026-11-17',sourceType:'manual',sourceId:'idempotent-a',sourceEvent:'post',idempotencyKey:'another',description:'idempotent-a',lines:[debit(accounts.cash.id,'1'),credit(accounts.equity.id,'1')]}),'CONFLICT')
      }finally{secondDb.close()}
    },path)
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('conventional trial balance reports ending debit and credit balances, not gross activity',async()=>fixture(({post,accounts,accounting,scoped})=>{
  post('sale',[debit(accounts.receivable.id,'500'),credit(accounts.income.id,'500')])
  post('receipt',[debit(accounts.cash.id,'200'),credit(accounts.receivable.id,'200')])
  const tb=accounting.trialBalance(scoped)
  assert.equal(tb.totalDebitMinor,'500')
  assert.equal(tb.totalCreditMinor,'500')
  const receivable=tb.rows.find(row=>row.code==='receivable')!
  assert.equal(receivable.debitMinor,'500')
  assert.equal(receivable.creditMinor,'200')
  assert.equal(receivable.balanceDebitMinor,'300')
  assert.equal(receivable.balanceCreditMinor,'0')
  assert.equal(tb.rows.find(row=>row.code==='income')?.balanceCreditMinor,'500')
  const summary=accounting.financialSummary(scoped)
  assert.equal(summary.assetsMinor,'500')
  assert.equal(summary.netIncomeMinor,'500')
}))

test('raw SQL cannot bypass the journal posting transition or an open fiscal period',async()=>fixture(({db,scoped,accounts,accounting})=>{
  const user=String(db.prepare('SELECT id FROM users WHERE company_id=? LIMIT 1').get(scoped.companyId)?.['id'])
  const period=accounting.listPeriods(scoped)[0]!
  const id='10000000-0000-4000-8000-000000000001'
  const insert=db.prepare(`INSERT INTO journal_entries(id,company_id,period_id,posted_on,
    source_type,source_id,source_event,idempotency_key,fingerprint,description,base_currency,posted_by,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  assert.throws(()=>insert.run(id,scoped.companyId,period.id,'2026-11-17','manual','raw','post','raw','fp','forged','IRR',user,'posted'),/begin in staging/u)
  db.exec('BEGIN IMMEDIATE')
  try {
    insert.run(id,scoped.companyId,period.id,'2028-02-01','manual','raw','post','raw','fp','wrong period','IRR',user,'staging')
    const line=db.prepare(`INSERT INTO journal_lines(id,journal_id,company_id,line_no,
      account_id,debit_minor,credit_minor,currency,transaction_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
    line.run('10000000-0000-4000-8000-000000000002',id,scoped.companyId,1,accounts.cash.id,100n,0n,'IRR',100n)
    line.run('10000000-0000-4000-8000-000000000003',id,scoped.companyId,2,accounts.equity.id,0n,100n,'IRR',100n)
    assert.throws(()=>db.prepare("UPDATE journal_entries SET status='posted' WHERE id=?").run(id),/open matching fiscal period/u)
  }finally {db.exec('ROLLBACK')}
  assert.equal(db.prepare('SELECT count(*) as n FROM journal_entries').get()?.['n'],0)
}))

test('posting and audit are rolled back with the caller transaction',async()=>fixture(({db,accounts,scoped,accounting})=>{
  db.exec('BEGIN IMMEDIATE')
  try {
    accounting.postWithinTransaction({...scoped,date:'2026-11-17',sourceType:'manual',sourceId:'rolled-back',sourceEvent:'post',
      idempotencyKey:'rolled-back',description:'Rolled back by source workflow',lines:[debit(accounts.cash.id,'30'),credit(accounts.equity.id,'30')]})
  } finally {db.exec('ROLLBACK')}
  assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
  assert.equal(db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='accounting.journal.post'").get()?.['n'],0)
  const result=accounting.postJournal({...scoped,date:'2026-11-17',sourceType:'manual',sourceId:'rolled-back',sourceEvent:'post',
    idempotencyKey:'rolled-back',description:'Rolled back by source workflow',lines:[debit(accounts.cash.id,'30'),credit(accounts.equity.id,'30')]})
  assert.equal(result.replayed,false)
  fail(()=>accounting.postJournal({...scoped,date:'2026-11-17',sourceType:'reversal',sourceId:'invalid',sourceEvent:'post',
    idempotencyKey:'invalid',description:'Fake reversal',lines:[debit(accounts.cash.id,'30'),credit(accounts.equity.id,'30')]}),'INVALID_INPUT')
}))

test('two independent companies have separate books and scoped idempotency',async()=>fixture(async({identity,accounting,scoped,accounts,post})=>{
  const second=await identity.bootstrapCompany({name:'Company B',adminUsername:'company-b-owner',adminDisplayName:'Company B Owner',password})
  const secondLogin=await identity.login({username:'company-b-owner',password})
  const b={sessionToken:secondLogin.token,companyId:second.company.id}
  accounting.setupBook({...b,baseCurrency:'USD',baseDecimals:2,timezone:'UTC'})
  accounting.addPeriod({...b,code:'2026',startsOn:'2026-01-01',endsOn:'2026-12-31'})
  const bCash=accounting.createAccount({...b,code:'cash',name:'Cash',category:'asset'})
  const bEquity=accounting.createAccount({...b,code:'equity',name:'Equity',category:'equity'})
  const aEntry=post('reused-key',[debit(accounts.cash.id,'150'),credit(accounts.equity.id,'150')])
  const bEntry=accounting.postJournal({...b,date:'2026-11-17',sourceType:'manual',sourceId:'reused-key',sourceEvent:'post',
    idempotencyKey:'reused-key',description:'Distinct company books',lines:[debit(bCash.id,'200'),credit(bEquity.id,'200')]})
  assert.notEqual(aEntry.id,bEntry.id)
  assert.equal(accounting.trialBalance(scoped).totalDebitMinor,'150')
  assert.equal(accounting.trialBalance(b).totalDebitMinor,'200')
  assert.equal(accounting.financialSummary(b).baseCurrency,'USD')
  fail(()=>accounting.postJournal({...b,date:'2026-11-17',sourceType:'manual',sourceId:'cross-company-account',sourceEvent:'post',
    idempotencyKey:'cross-company-account',description:'Must fail',lines:[debit(accounts.cash.id,'100'),credit(bEquity.id,'100')]}),'NOT_FOUND')
  const staff=await identity.createUser({sessionToken:scoped.sessionToken,username:'company-a-staff',displayName:'Company A staff',password})
  const role=identity.listRoles({sessionToken:scoped.sessionToken}).find(r=>r.code==='company-reader')!
  identity.assignRole({sessionToken:scoped.sessionToken,userId:staff.id,roleId:role.id})
  const login=await identity.login({username:'company-a-staff',password})
  assert.equal(accounting.trialBalance({...scoped,sessionToken:login.token}).totalDebitMinor,'150')
  deny(()=>accounting.trialBalance({...b,sessionToken:login.token}),'NOT_FOUND')
}))
