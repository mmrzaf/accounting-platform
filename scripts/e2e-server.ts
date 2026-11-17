#!/usr/bin/env node
/** Disposable browser-acceptance fixture. Never touches the installation database. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../src/platform/database/sqlite.ts'
import { applyMigrations } from '../src/platform/database/migrations.ts'
import { createIdentityService } from '../src/modules/identity/service.ts'
import { createAccountingService } from '../src/modules/accounting/service.ts'
import { createTradingService } from '../src/modules/trading/service.ts'
import { createApplication } from '../src/platform/server/application.ts'
import { listen } from '../src/platform/server/node-http.ts'

const root=fileURLToPath(new URL('../',import.meta.url))
const migrations=join(root,'migrations')
const port=37123
const publicOrigin=`http://127.0.0.1:${port}`
const password='Browser E2E test credentials only 2026'
const directory=await mkdtemp(join(tmpdir(),'accounting-browser-'))
const databasePath=join(directory,'acceptance.sqlite')
let application:ReturnType<typeof createApplication>|undefined
try {
  const db=openDatabase(databasePath)
  try {
    applyMigrations(db,migrations)
    const identity=createIdentityService(db)
    const accounting=createAccountingService(db)
    const trading=createTradingService(db)
    const bootstrap=await identity.bootstrapCompany({name:'Acceptance Company',adminUsername:'e2eowner',adminDisplayName:'E2E Owner',password})
    const {token}=await identity.login({username:'e2eowner',password})
    const scope={sessionToken:token,companyId:bootstrap.company.id}
    accounting.setupBook({...scope,baseCurrency:'IRR',baseDecimals:0,timezone:'Asia/Tehran'})
    accounting.initializeStarterChart({...scope,locale:'en'})
    const year=new Date().getUTCFullYear()
    accounting.addPeriod({...scope,code:String(year),startsOn:`${year}-01-01`,endsOn:`${year}-12-31`})
    trading.createContact({...scope,displayName:'Test Supplier'})
  }finally{db.close()}
  application=createApplication({databasePath,migrationDirectory:migrations,publicOrigin,
    attachmentDirectory:join(directory,'attachments'),webDistDirectory:join(root,'web','dist')})
  await listen(application.server,'127.0.0.1',port)
  process.stdout.write(`Disposable browser fixture listening at ${publicOrigin}\n`)
} catch(error){
  await application?.close()
  await rm(directory,{recursive:true,force:true})
  throw error
}
let closing=false
const stop=()=>{
  if(closing)return
  closing=true
  void application!.close().then(()=>rm(directory,{recursive:true,force:true}))
    .catch(error=>{process.stderr.write(`${String(error)}\n`);process.exitCode=1})
}
process.once('SIGINT',stop)
process.once('SIGTERM',stop)
