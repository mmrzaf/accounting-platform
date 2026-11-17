import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { createIdentityContext, transaction } from '../identity/context.ts'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { createAccountingReferenceReader } from '../accounting/references.ts'
import { AccountingError } from '../accounting/errors.ts'
import { encryptApiKey, decryptApiKey, validateMasterKey } from './credentials.ts'
import { aiError, AiError } from './errors.ts'
import { completeChat, validatedBaseUrl } from './provider.ts'
import type { ChatMessage } from './provider.ts'
import { makeToolExecutor, validateToolArguments } from './tools.ts'
import { decodeArgs, json, required, sha } from './validation.ts'

interface ProviderRow {
  base_url: string; model: string; encrypted_api_key: string; supports_tools: number; enabled: number
}
interface PolicyRow { auto_drafts: number; auto_post: number }
interface TurnRow {
  id: string; company_id: string; user_id: string; client_request_id: string;
  prompt_hash: string; status: 'processing'|'completed'|'awaiting_approval'|'failed'; reply: string|null;
  created_at: string; updated_at: string
}
interface ActionRow {
  id: string; company_id: string; user_id: string; turn_id: string;
  tool_name: string; input_json: string; fingerprint: string;
  state: 'awaiting_approval'|'executing'|'completed'|'failed'|'rejected'; result_json: string|null; error_code: string|null; created_at: string
}
export interface CompanyAiInput { sessionToken: string; companyId: string }
export interface RunTurnInput extends CompanyAiInput {
  message: string
  clientRequestId: string
  /** Trusted user-facing command control. Never populated from a model response. Defaults to review. */
  executionMode?: 'auto'|'review'
}
export interface ActionDecisionInput extends CompanyAiInput {
  actionId: string
  /** Fingerprint shown with the action preview; prevents approving a different command. */
  expectedFingerprint: string
}
const SYSTEM_INSTRUCTIONS = `You are an accounting operations assistant. Tools are the only source of business facts and the only way to change records.
Never guess contact, company, bank or ledger account IDs. Search existing records first; ask a concise clarification when ambiguous.
Do not invent financial operations, exchange rates or currency conversions. Tool monetary amounts MUST be exact base-currency minor-unit integer strings, not display Toman amounts.
A draft is not posted. Posting records transactions in this software, NOT an external bank transfer. High-risk corrections and privileged configuration have no AI tools.
Use a maximum of one mutating tool in this turn; further operations require a new user turn. If information is missing, ask before executing. Never claim an action completed unless its tool result confirms success.`

/** Minimal, auditable, framework-independent AI use cases. Requires an operator-provided 32-byte master key. */
export function createAiService(db: DatabaseSync, options: {
  masterKey: Uint8Array
  clock?: () => Date
  fetcher?: typeof fetch
  timeoutMs?: number
} ) {
  const master = validateMasterKey(options.masterKey)
  const clock = options.clock ?? (() => new Date())
  const identity = createIdentityContext(db, clock)
  const tools = makeToolExecutor(db, clock)
  const accountingReferences = createAccountingReferenceReader(db)
  const fetcher = options.fetcher ?? fetch
  const now = () => clock().toISOString()
  const time = () => clock().getTime()
  const scopeActor = (input: CompanyAiInput, permission: 'ai.use'|'ai.policy'|'ai.execute') => identity.requireActor(input.sessionToken, permission, input.companyId)
  const orgActor = (sessionToken: string) => identity.requireActor(sessionToken, 'ai.configure')
  const provider = (companyId: string) => rowAs<ProviderRow>(db.prepare('SELECT base_url,model,encrypted_api_key,supports_tools,enabled FROM ai_provider_configs WHERE company_id=?').get(companyId))
  const policy = (companyId: string): PolicyRow => rowAs<PolicyRow>(db.prepare('SELECT auto_drafts,auto_post FROM ai_company_policies WHERE company_id=?').get(companyId)) ?? { auto_drafts: 1, auto_post: 0 }

  function configureProvider(input: {
    sessionToken: string; baseUrl: string; model: string; apiKey?: string; supportsTools: boolean; enabled: boolean
  }) {
    const actor = orgActor(input.sessionToken)
    const baseUrl = validatedBaseUrl(input.baseUrl), model = required(input.model, 'model', 128)
    if (typeof input.supportsTools !== 'boolean' || typeof input.enabled !== 'boolean') return aiError('INVALID_INPUT','Invalid provider flags')
    return transaction(db, () => {
      const existing = provider(actor.companyId)
      if (input.apiKey === undefined && !existing) return aiError('INVALID_INPUT','Initial provider configuration requires an API key')
      const cipher = input.apiKey === undefined ? existing!.encrypted_api_key : encryptApiKey(input.apiKey, master, actor.companyId)
      db.prepare(`INSERT INTO ai_provider_configs(company_id,base_url,model,encrypted_api_key,supports_tools,enabled,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,
        encrypted_api_key=excluded.encrypted_api_key,supports_tools=excluded.supports_tools,enabled=excluded.enabled,updated_at=excluded.updated_at`)
        .run(actor.companyId,baseUrl,model,cipher,input.supportsTools?1:0,input.enabled?1:0,now())
      identity.audit({ companyId: actor.companyId, actorId: actor.userId, action: 'ai.provider.configure', subjectType: 'ai_provider',
        details: { enabled: input.enabled, supportsTools: input.supportsTools, credentialsRotated: input.apiKey !== undefined } })
      return { baseUrl, model, supportsTools: input.supportsTools, enabled: input.enabled, hasApiKey: true }
    })
  }
  function getProvider(input: { sessionToken: string }) {
    const actor = orgActor(input.sessionToken)
    const row = provider(actor.companyId)
    return row ? { baseUrl: row.base_url, model: row.model, supportsTools: !!row.supports_tools, enabled: !!row.enabled, hasApiKey: true } : null
  }
  function setPolicy(input: CompanyAiInput & { autoDrafts: boolean; autoPost: boolean }) {
    const actor = scopeActor(input, 'ai.policy')
    if (typeof input.autoDrafts !== 'boolean' || typeof input.autoPost !== 'boolean') return aiError('INVALID_INPUT','Invalid AI autonomy policy')
    return transaction(db, () => {
      db.prepare(`INSERT INTO ai_company_policies(company_id,auto_drafts,auto_post,updated_at) VALUES(?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET auto_drafts=excluded.auto_drafts,
        auto_post=excluded.auto_post,updated_at=excluded.updated_at`)
        .run(input.companyId,input.autoDrafts?1:0,input.autoPost?1:0,now())
      identity.audit({ companyId: input.companyId, actorId: actor.userId,
        action: 'ai.policy.configure', subjectType: 'company', subjectId: input.companyId,
        details: { autoDrafts: input.autoDrafts, autoPost: input.autoPost } })
      return { autoDrafts: input.autoDrafts, autoPost: input.autoPost }
    })
  }
  function getPolicy(input: CompanyAiInput) {
    scopeActor(input, 'ai.use')
    const row = policy(input.companyId)
    return { autoDrafts: !!row.auto_drafts, autoPost: !!row.auto_post }
  }
  function getTurn(input: CompanyAiInput & { turnId: string }) {
    const actor = scopeActor(input, 'ai.use')
    const row = rowAs<TurnRow>(db.prepare('SELECT * FROM ai_turns WHERE company_id=? AND user_id=? AND id=?')
      .get(actor.companyId,actor.userId,input.turnId))
    if (!row) return aiError('INVALID_STATE','AI turn not found')
    const action = rowAs<ActionRow>(db.prepare('SELECT * FROM ai_actions WHERE company_id=? AND user_id=? AND turn_id=?')
      .get(actor.companyId,actor.userId,row.id))
    return { id: row.id, status: row.status, reply: row.reply, createdAt: row.created_at,
      action: action ? { id: action.id, tool: action.tool_name, input: JSON.parse(action.input_json) as unknown,
        fingerprint: action.fingerprint, state: action.state,
        result: action.result_json ? JSON.parse(action.result_json) as unknown : null } : null }
  }
  function listTurns(input: CompanyAiInput & { limit?: number }) {
    const actor = scopeActor(input, 'ai.use')
    const limit = input.limit ?? 25
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return aiError('INVALID_INPUT','Invalid turn limit')
    return rowsAs<Pick<TurnRow,'id'|'status'|'reply'|'created_at'>>(db.prepare(`SELECT id,status,reply,created_at FROM ai_turns
      WHERE company_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(actor.companyId,actor.userId,limit))
  }
  function updateTurn(turnId: string, status: TurnRow['status'], reply: string) {
    db.prepare('UPDATE ai_turns SET status=?,reply=?,updated_at=? WHERE id=?').run(status,reply.slice(0,10000),now(),turnId)
  }
  function insertAction(input: { id: string; turnId: string; companyId: string; userId: string; name: string; args: unknown; state: ActionRow['state'] }) {
    const argumentJson = json(input.args)
    if (argumentJson.length > 20000) return aiError('PROVIDER_RESPONSE_INVALID','Tool payload too large')
    const fingerprint = sha(json({ tool: input.name, args: input.args, companyId: input.companyId }))
    db.prepare(`INSERT INTO ai_actions(id,turn_id,company_id,user_id,tool_name,input_json,fingerprint,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(input.id,input.turnId,input.companyId,input.userId,input.name,argumentJson,fingerprint,input.state,now(),now())
    return fingerprint
  }
  function executeAction(input: { actionId: string; turnId: string; userId: string; companyId: string; token: string; name: string; args: unknown }) {
    const tool = tools.descriptor(input.name)
    return transaction(db, () => {
      const state = rowAs<{ state: string }>(db.prepare('SELECT state FROM ai_actions WHERE id=? AND company_id=? AND user_id=?').get(input.actionId,input.companyId,input.userId))
      if (!state || state.state !== 'awaiting_approval') return aiError('INVALID_STATE','AI action is not awaiting execution')
      // Read roles and company membership again at the time of execution, never only when proposed.
      scopeActor({ sessionToken: input.token, companyId: input.companyId }, 'ai.execute')
      if (tool.risk === 'read') return aiError('INVALID_STATE','Read-only tool cannot be approved as an action')
      db.prepare("UPDATE ai_actions SET state='executing',updated_at=? WHERE id=?").run(now(),input.actionId)
      const result = tools.execute(input.name,input.args,{ sessionToken: input.token,companyId: input.companyId },`ai-${input.actionId}`)
      const resultJson = json(result)
      if (resultJson.length > 50000) return aiError('INVALID_STATE','Tool result exceeds permitted size')
      db.prepare("UPDATE ai_actions SET state='completed',result_json=?,updated_at=? WHERE id=?")
        .run(resultJson,now(),input.actionId)
      identity.audit({ companyId: input.companyId, actorId: input.userId,
        action: 'ai.tool.execute', subjectType: 'ai_action', subjectId: input.actionId,
        details: { tool: input.name, risk: tool.risk } })
      updateTurn(input.turnId,'completed',`Completed ${input.name}. See the structured result for the exact record and status.`)
      return result
    })
  }
  function approveAction(input: ActionDecisionInput) {
    const actor = scopeActor(input, 'ai.execute')
    const action = rowAs<ActionRow>(db.prepare('SELECT * FROM ai_actions WHERE id=? AND company_id=? AND user_id=?')
      .get(input.actionId,actor.companyId,actor.userId))
    if (!action || action.state !== 'awaiting_approval') return aiError('INVALID_STATE','AI action not awaiting confirmation')
    if (action.fingerprint !== input.expectedFingerprint) return aiError('CONFLICT','AI proposal has changed or confirmation is stale')
    if (time() - Date.parse(action.created_at) > 15*60*1000) return aiError('INVALID_STATE','AI proposal has expired')
    return executeAction({ actionId: action.id,turnId: action.turn_id,userId: actor.userId,
      companyId: input.companyId,token: input.sessionToken,name: action.tool_name,args: JSON.parse(action.input_json) as unknown })
  }
  function rejectAction(input: ActionDecisionInput) {
    const actor = scopeActor(input, 'ai.use')
    return transaction(db, () => {
      const action = rowAs<ActionRow>(db.prepare('SELECT * FROM ai_actions WHERE id=? AND company_id=? AND user_id=?')
        .get(input.actionId,actor.companyId,actor.userId))
      if (!action || action.state !== 'awaiting_approval') return aiError('INVALID_STATE','AI action not awaiting confirmation')
      if (action.fingerprint !== input.expectedFingerprint) return aiError('CONFLICT','AI proposal has changed or rejection is stale')
      db.prepare("UPDATE ai_actions SET state='rejected',updated_at=? WHERE id=?").run(now(),action.id)
      updateTurn(action.turn_id,'completed','Action rejected; no business change was made.')
      identity.audit({ companyId: input.companyId, actorId: actor.userId,
        action: 'ai.tool.reject', subjectType: 'ai_action', subjectId: action.id, details: { tool: action.tool_name } })
      return { id: action.id, state: 'rejected' as const }
    })
  }

  async function runTurn(input: RunTurnInput) {
    const actor = scopeActor(input, 'ai.use')
    const message = required(input.message, 'message', 4000)
    const clientRequestId = required(input.clientRequestId, 'clientRequestId', 128)
    const executionMode = input.executionMode ?? 'review'
    if (executionMode !== 'auto' && executionMode !== 'review') return aiError('INVALID_INPUT','Invalid execution mode')
    const config = provider(actor.companyId)
    if (!config || !config.enabled) return aiError('CONFIGURATION_REQUIRED','AI provider is not enabled for this company')
    const promptHash = sha(json({ message, executionMode }))
    const turnId = randomUUID()
    const existing = transaction(db, () => {
      const prior = rowAs<TurnRow>(db.prepare(`SELECT * FROM ai_turns WHERE company_id=? AND user_id=? AND client_request_id=?`)
        .get(actor.companyId,actor.userId,clientRequestId))
      if (prior) {
        if (prior.prompt_hash !== promptHash) return aiError('CONFLICT','AI request key reused for a different message')
        return prior.id
      }
      // Bounded per-user provider spend even if several browser tabs submit concurrently.
      const windowStart = new Date(time()-60_000).toISOString()
      const recent = rowAs<{ n: number }>(db.prepare('SELECT count(*) AS n FROM ai_turns WHERE company_id=? AND user_id=? AND created_at>=?')
        .get(actor.companyId,actor.userId,windowStart))?.n ?? 0
      if (recent >= 20) return aiError('RATE_LIMITED','AI request rate limit exceeded; try later')
      db.prepare(`INSERT INTO ai_turns(id,company_id,user_id,client_request_id,prompt_hash,status,created_at,updated_at) VALUES(?,?,?,?,?,'processing',?,?)`).run(turnId,input.companyId,actor.userId,clientRequestId,promptHash,now(),now())
      identity.audit({ companyId: input.companyId,actorId: actor.userId,
        action: 'ai.turn.start',subjectType: 'ai_turn',subjectId: turnId })
      return null
    })
    if (existing) return getTurn({ ...input,turnId: existing })
    try {
      const available = config.supports_tools ? tools.available(input.sessionToken,input.companyId) : []
      const allowedNames = new Set(available.map(t => t.function.name))
      let book: { base_currency: string; timezone: string; decimals: number } | null = null
      try { book = accountingReferences.book(actor, input.companyId) }
      catch (error) { if (!(error instanceof AccountingError) || error.code !== 'NOT_FOUND') throw error }
      const localDate = book ? new Intl.DateTimeFormat('sv-SE',{timeZone:book.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(clock()) : null
      const accountingContext = book ? `Company accounting base currency: ${book.base_currency}; minor-unit decimals: ${book.decimals}; company timezone: ${book.timezone}; local date: ${localDate}.` : 'No accounting book configured; do not create or post financial documents.'
      const system = `${SYSTEM_INSTRUCTIONS}\n${accountingContext}\nCurrent company ID: ${input.companyId}.\nThis is a single-turn request. Do not imply that you have access to earlier messages.`
      const messages: ChatMessage[] = [{ role: 'system', content: system }, { role: 'user', content: message }]
      const apiKey = decryptApiKey(config.encrypted_api_key,master,actor.companyId)
      for (let round = 0; round < 4; round++) {
        const response = await completeChat({ fetcher,baseUrl:config.base_url,apiKey,model:config.model,
          messages,tools:available, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) })
        if (!response.calls.length) {
          transaction(db, () => updateTurn(turnId,'completed',response.text || 'No answer was returned by the configured model.'))
          return getTurn({ ...input,turnId })
        }
        if (!config.supports_tools || response.calls.some(call => !allowedNames.has(call.function.name)))
          return aiError('PROVIDER_RESPONSE_INVALID','Provider requested an unavailable tool')
        const mutationCalls = response.calls.filter(call => tools.descriptor(call.function.name).risk !== 'read')
        if (mutationCalls.length > 1 || (mutationCalls.length && response.calls.length !== 1))
          return aiError('PROVIDER_RESPONSE_INVALID','Multiple or mixed mutating tool calls are not allowed')
        if (mutationCalls.length === 1) {
          const call = mutationCalls[0]!
          const tool = tools.descriptor(call.function.name)
          const args = validateToolArguments(call.function.name, decodeArgs(call.function.arguments))
          // Validate arguments before storing or presenting a proposal. Execute through the real service later.
          // Checking a read-only permission here cannot grant mutation authority.
          const aiPolicy = policy(input.companyId)
          const permitted = tools.permitted(input.sessionToken,input.companyId,tool)
          if (!permitted) return aiError('INVALID_STATE','AI tool is not authorized')
          const id = randomUUID()
          const fingerprint = transaction(db, () => {
            const fp = insertAction({ id,turnId,companyId:input.companyId,
              userId:actor.userId,name:call.function.name,args,state:'awaiting_approval' })
            updateTurn(turnId,'awaiting_approval',`Review ${call.function.name}; no business change has been made yet.`)
            identity.audit({ companyId: input.companyId, actorId: actor.userId,
              action: 'ai.tool.propose',subjectType:'ai_action',subjectId:id,
              details: { tool: call.function.name, risk: tool.risk } })
            return fp
          })
          const autoAllowed = executionMode === 'auto' && (tool.risk === 'draft' ? !!aiPolicy.auto_drafts : !!aiPolicy.auto_post)
          if (autoAllowed) {
            try {
              executeAction({ actionId:id,turnId,companyId:input.companyId,
                userId:actor.userId,token:input.sessionToken,name:call.function.name,args })
            } catch (error) {
              // All business changes rollback atomically if execution fails; retain a redacted failure audit.
              transaction(db, () => {
                db.prepare("UPDATE ai_actions SET state='failed',error_code=?,updated_at=? WHERE id=?")
                  .run(error instanceof AiError ? error.code : 'EXECUTION_FAILED',now(),id)
                updateTurn(turnId,'failed','The business operation failed validation or execution; no transaction was committed.')
                identity.audit({ companyId: input.companyId, actorId: actor.userId,
                  action:'ai.tool.failed',outcome:'failure',subjectType:'ai_action',subjectId:id,details:{ tool:call.function.name } })
              })
              throw error
            }
          }
          return { ...getTurn({ ...input,turnId }), fingerprint }
        }
        messages.push({ role:'assistant',content: response.text,tool_calls:response.calls })
        for (const call of response.calls) {
          const args = validateToolArguments(call.function.name, decodeArgs(call.function.arguments))
          const result = tools.execute(call.function.name,args,{ sessionToken: input.sessionToken,companyId: input.companyId },`read-${turnId}`)
          const content = json(result)
          if (content.length > 80000) return aiError('PROVIDER_RESPONSE_INVALID','Tool results too large')
          identity.audit({ companyId:input.companyId,actorId:actor.userId,
            action:'ai.tool.read',subjectType:'ai_turn',subjectId:turnId,details:{tool:call.function.name} })
          messages.push({ role:'tool',tool_call_id:call.id,content })
        }
      }
      return aiError('PROVIDER_RESPONSE_INVALID','AI reached the bounded tool-call limit')
    } catch (error) {
      const current = rowAs<Pick<TurnRow,'status'>>(db.prepare('SELECT status FROM ai_turns WHERE id=?').get(turnId))
      if (current?.status === 'processing') transaction(db, () => updateTurn(turnId,'failed','AI request failed; retry with a new request ID after inspecting the result.'))
      throw error
    }
  }
  return Object.freeze({ configureProvider,getProvider,setPolicy,getPolicy,runTurn,approveAction,rejectAction,getTurn,listTurns })
}
