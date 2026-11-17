import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../../src/platform/database/sqlite.ts'
import { applyMigrations } from '../../src/platform/database/migrations.ts'
import { createIdentityService } from '../../src/modules/identity/service.ts'
import { createAiService } from '../../src/modules/ai/service.ts'

const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url))
const secret = 'A sufficiently long administrator recovery password'
async function setup() {
  const db = openDatabase(':memory:')
  applyMigrations(db, migrations)
  const identity = createIdentityService(db)
  const company = await identity.bootstrapCompany({ name:'AI recovery tests', adminUsername:'recover',adminDisplayName:'Recover',password:secret })
  const login = await identity.login({ username:'recover', password:secret })
  const scope = { companyId: company.company.id, sessionToken: login.token }
  const ai = createAiService(db,{ masterKey: randomBytes(32) })
  return { db, ai, scope, userId: company.administrator.id }
}
const old = (minutes:number)=>new Date(Date.now()-minutes*60_000).toISOString()

test('an interrupted provider turn is safely failed on next conversation access, without replaying any command',async()=>{
  const f=await setup()
  try {
    const c=f.ai.createConversation(f.scope)
    const id=randomUUID()
    f.db.prepare(`INSERT INTO ai_turns (id,company_id,user_id,conversation_id,user_message,context_json,client_request_id,prompt_hash,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'{}',?,?,'processing',?,?)`)
      .run(id,f.scope.companyId,f.userId,c.id,'Create a purchase','abandoned-key','a'.repeat(64),old(6),old(6))
    const view=f.ai.getConversation({...f.scope,conversationId:c.id})
    assert.equal(view.turns.length,1)
    assert.equal(view.turns[0]?.status,'failed')
    assert.match(view.turns[0]?.reply??'',/interrupted/u)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n'] ?? 0,0)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='ai.turn.recover'").get()?.['n'],1)
    f.ai.getConversation({...f.scope,conversationId:c.id})
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='ai.turn.recover'").get()?.['n'],1)
  }finally{f.db.close()}
})

test('expired proposal is rejected without financial execution; recent requests are left alone',async()=>{
  const f=await setup()
  try {
    const c=f.ai.createConversation(f.scope)
    const id=randomUUID(),recentId=randomUUID(),actionId=randomUUID()
    const insert=f.db.prepare(`INSERT INTO ai_turns (id,company_id,user_id,conversation_id,user_message,context_json,client_request_id,prompt_hash,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'{}',?,? ,?,?,?)`)
    insert.run(id,f.scope.companyId,f.userId,c.id,'Post invoice','expired-key','a'.repeat(64),'awaiting_approval',old(20),old(20))
    insert.run(recentId,f.scope.companyId,f.userId,c.id,'Still working','recent-key','b'.repeat(64),'processing',old(1),old(1))
    f.db.prepare(`INSERT INTO ai_actions (id,turn_id,company_id,user_id,tool_name,input_json,preview_json,fingerprint,state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'awaiting_approval',?,?)`)
      .run(actionId,id,f.scope.companyId,f.userId,'post_invoice','{}','{"title":"Post invoice","description":"", "risk":"financial", "fields":[]}','c'.repeat(64),old(20),old(20))
    const view=f.ai.getConversation({...f.scope,conversationId:c.id})
    assert.equal(view.turns.length,2)
    assert.equal(view.turns[0]?.status,'completed')
    assert.equal(view.turns[0]?.action?.state,'rejected')
    assert.equal(view.turns[1]?.status,'processing')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM journal_entries').get()?.['n']??0,0)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='ai.action.expire'").get()?.['n'],1)
  }finally{f.db.close()}
})
