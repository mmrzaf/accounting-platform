import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAiService } from '../../src/modules/ai/service.ts'
import { createAiHttpHandler } from '../../src/platform/http/ai-handler.ts'

const migrations = fileURLToPath(new URL('../../migrations/',import.meta.url))
const password = 'a sufficiently long AI HTTP password'

test('AI HTTP adapter uses the existing session, CSRF and same-origin security model', async () => {
  const db = openDatabase(':memory:')
  applyMigrations(db,migrations)
  try {
    const identity = createIdentityService(db)
    const boot = await identity.bootstrapCompany({name:'API',adminUsername:'owner',adminDisplayName:'Owner',password})
    const {token} = await identity.login({username:'owner',password})
    const ai = createAiService(db,{masterKey:randomBytes(32),fetcher:async() => new Response(JSON.stringify({choices:[{message:{content:'Helpful answer'},finish_reason:'stop'}]}),{status:200})})
    const handler = createAiHttpHandler(identity,ai)
    const authHeaders = { cookie:`accounting_session=${token}`, 'content-type':'application/json', origin:'http://localhost',
      'x-csrf-token':identity.me(token).csrfToken }
    const request = (path:string,method='GET',body?:unknown,headers:Record<string,string>=authHeaders) => new Request('http://localhost'+path,{
      method,headers,...(body===undefined ? {} : {body:JSON.stringify(body)}) })
    const fail = await handler(request(`/api/ai/policy?companyId=${boot.company.id}`,'GET',undefined,{}))
    assert.equal(fail.status,401)
    assert.equal((await fail.json() as {error:{code:string}}).error.code,'NOT_AUTHENTICATED')
    const noCsrf = await handler(request('/api/ai/provider','PUT',{baseUrl:'https://model.example/v1',model:'a',apiKey:'sample-key',supportsTools:true,enabled:true},{...authHeaders,'x-csrf-token':'invalid'}))
    assert.equal(noCsrf.status,403)
    const crossOrigin = await handler(request('/api/ai/provider','PUT',{baseUrl:'https://model.example/v1',model:'a',apiKey:'sample-key',supportsTools:true,enabled:true},{...authHeaders,origin:'https://other.example'}))
    assert.equal(crossOrigin.status,403)
    const unconfiguredStatus=await handler(request('/api/ai/status'))
    assert.equal(unconfiguredStatus.status,200)
    assert.equal((await unconfiguredStatus.json() as {ready:boolean}).ready,false)
    const configured = await handler(request('/api/ai/provider','PUT',{baseUrl:'https://model.example/v1',model:'a',apiKey:'sample-key',supportsTools:false,enabled:true}))
    assert.equal(configured.status,200)
    assert.equal(JSON.stringify(await configured.json()).includes('sample-key'),false)
    const readyStatus=await handler(request('/api/ai/status'))
    assert.equal(readyStatus.status,200)
    const visibleStatus=await readyStatus.json() as {ready:boolean;model:string|null}
    assert.equal(visibleStatus.ready,true)
    assert.equal(visibleStatus.model,'a')
    const provider = await handler(request('/api/ai/provider'))
    assert.equal(provider.status,200)
    assert.equal((await provider.json() as {model:string}).model,'a')
    const turn = await handler(request('/api/ai/turns','POST',{companyId:boot.company.id,message:'Help me',clientRequestId:randomUUID()}))
    assert.equal(turn.status,201)
    const result = await turn.json() as {status:string;id:string}
    assert.equal(result.status,'completed')
    const detail = await handler(request(`/api/ai/turns/${result.id}?companyId=${boot.company.id}`))
    assert.equal(detail.status,200)
    assert.equal((await detail.json() as {reply:string}).reply,'Helpful answer')
    const unauthorizedTls = await handler(new Request('http://example.net/api/ai/provider',{headers:authHeaders}))
    assert.equal(unauthorizedTls.status,403)
    assert.equal(db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'],0)
  } finally {db.close()}
})
