import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAccountingService } from '../../src/modules/accounting/service.ts'
import { AccountingError } from '../../src/modules/accounting/errors.ts'
import { IdentityError } from '../../src/modules/identity/errors.ts'
const migrationDir=fileURLToPath(new URL('../../migrations/',import.meta.url))
const password='a long secure password for the accounting starter chart'

test('a new company can initialize a bilingual starter chart once with all posting defaults',async()=>{
  const db=openDatabase(':memory:')
  applyMigrations(db,migrationDir)
  try {
    const identity=createIdentityService(db), accounting=createAccountingService(db)
    const company=await identity.bootstrapCompany({name:'Demo',adminUsername:'demo-owner',adminDisplayName:'Owner',password})
    const {token}=await identity.login({username:'demo-owner',password})
    const scope={companyId:company.company.id,sessionToken:token}
    accounting.setupBook({...scope,baseCurrency:'IRR',baseDecimals:0,timezone:'Asia/Tehran'})
    const result=accounting.initializeStarterChart({...scope,locale:'fa'})
    assert.equal(result.accounts.length,7)
    assert.equal(result.accounts.find(a=>a.code==='1300')?.name,'حساب‌های دریافتنی')
    const defaults=accounting.getPostingDefaults(scope)
    assert.equal(defaults?.receivablesId,result.accounts.find(a=>a.code==='1300')?.id)
    assert.equal(defaults?.cashId,result.accounts.find(a=>a.code==='1200')?.id)
    assert.equal(accounting.listAccounts(scope).length,7)
    assert.throws(()=>accounting.initializeStarterChart({...scope,locale:'en'}),e=>e instanceof AccountingError&&e.code==='CONFLICT')
    assert.equal(accounting.listAccounts(scope).length,7)
    assert.equal(db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='accounting.starter-chart.initialize'").get()?.['n'],1)
  }finally{db.close()}
})

test('starter chart does not overwrite custom charts and is company-authorized',async()=>{
  const db=openDatabase(':memory:')
  applyMigrations(db,migrationDir)
  try {
    const identity=createIdentityService(db),accounting=createAccountingService(db)
    const c1=await identity.bootstrapCompany({name:'First',adminUsername:'first',adminDisplayName:'First',password})
    const c2=await identity.bootstrapCompany({name:'Second',adminUsername:'second',adminDisplayName:'Second',password})
    const {token}=await identity.login({username:'first',password})
    const scope={companyId:c1.company.id,sessionToken:token}
    accounting.setupBook({...scope,baseCurrency:'IRR',baseDecimals:0,timezone:'Asia/Tehran'})
    accounting.createAccount({...scope,code:'custom',name:'User account',category:'asset'})
    assert.throws(()=>accounting.initializeStarterChart({...scope,locale:'en'}),e=>e instanceof AccountingError&&e.code==='CONFLICT')
    assert.equal(accounting.listAccounts(scope).length,1)
    assert.throws(()=>accounting.initializeStarterChart({...scope,companyId:c2.company.id,locale:'en'}),e=>e instanceof IdentityError&&e.code==='NOT_FOUND')
  }finally{db.close()}
})
