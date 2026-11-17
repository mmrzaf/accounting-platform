import { randomUUID } from 'node:crypto'
import type { createIdentityService } from '../../modules/identity/service.ts'
import type { createAiService } from '../../modules/ai/service.ts'
import { AiError } from '../../modules/ai/errors.ts'
import { IdentityError, unauthenticated } from '../../modules/identity/errors.ts'
import { response, bearerCookie, parseJson, assertSameOrigin, assertLocalOrTls } from './request-security.ts'

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new AiError('INVALID_INPUT', `Invalid ${label}`)
  return value
}
/** Authenticated AI transport adapter mounted by the local Node server when configured. */
export function createAiHttpHandler(identity: ReturnType<typeof createIdentityService>, ai: ReturnType<typeof createAiService>) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID()
    try {
      const url = new URL(request.url)
      const secure = assertLocalOrTls(url)
      const method = request.method.toUpperCase()
      if (method !== 'GET' && method !== 'POST' && method !== 'PUT')
        return response({error:{code:'NOT_FOUND',message:'Not found'},requestId},404)
      if (method !== 'GET') assertSameOrigin(request,url)
      const sessionToken = bearerCookie(request,secure)
      if (!sessionToken) throw unauthenticated()
      const session = identity.me(sessionToken)
      const companyId = session.company.id
      if (method !== 'GET') identity.verifyCsrf(sessionToken,request.headers.get('x-csrf-token'))
      if (url.pathname === '/api/ai/provider' && method === 'GET')
        return response(ai.getProvider({sessionToken}))
      if (url.pathname === '/api/ai/provider' && method === 'PUT') {
        const b = await parseJson(request)
        return response(ai.configureProvider({sessionToken,baseUrl:text(b['baseUrl'],'baseUrl'),model:text(b['model'],'model'),
          ...(b['apiKey'] === undefined ? {} : {apiKey:text(b['apiKey'],'apiKey')}),
          supportsTools:b['supportsTools'] as boolean,enabled:b['enabled'] as boolean }))
      }
      if (url.pathname === '/api/ai/policy' && method === 'GET')
        return response(ai.getPolicy({sessionToken,companyId}))
      if (url.pathname === '/api/ai/policy' && method === 'PUT') {
        const b = await parseJson(request)
        return response(ai.setPolicy({sessionToken,companyId,
          autoDrafts:b['autoDrafts'] as boolean,autoPost:b['autoPost'] as boolean }))
      }
      if (url.pathname === '/api/ai/turns' && method === 'GET')
        return response({items:ai.listTurns({sessionToken,companyId,
          ...(url.searchParams.has('limit') ? {limit:Number(url.searchParams.get('limit'))} : {}) })})
      if (url.pathname === '/api/ai/turns' && method === 'POST') {
        const b = await parseJson(request)
        return response(await ai.runTurn({sessionToken,companyId,message:text(b['message'],'message'),
          clientRequestId:text(b['clientRequestId'],'clientRequestId'),
          ...(b['executionMode'] === undefined ? {} : {executionMode:b['executionMode'] as 'auto'|'review'}) }),201)
      }
      const turn = /^\/api\/ai\/turns\/([0-9a-f-]{36})$/u.exec(url.pathname)
      if (turn && method === 'GET') return response(ai.getTurn({sessionToken,companyId,turnId:turn[1]!}))
      const action = /^\/api\/ai\/actions\/([0-9a-f-]{36})\/(approve|reject)$/u.exec(url.pathname)
      if (action && method === 'POST') {
        const b = await parseJson(request)
        const args = {sessionToken,companyId,actionId:action[1]!,expectedFingerprint:text(b['expectedFingerprint'],'expectedFingerprint')}
        return response(action[2] === 'approve' ? ai.approveAction(args) : ai.rejectAction(args))
      }
      return response({error:{code:'NOT_FOUND',message:'Not found'},requestId},404)
    } catch (error) {
      const code = error instanceof AiError || error instanceof IdentityError ? error.code : 'INTERNAL_ERROR'
      const status = ({ INVALID_INPUT:400,VALIDATION_FAILED:400,NOT_AUTHENTICATED:401,PERMISSION_DENIED:403,
        NOT_FOUND:404,CONFLICT:409,INVALID_STATE:409,CONFIGURATION_REQUIRED:503,RATE_LIMITED:429,PROVIDER_UNAVAILABLE:502,PROVIDER_RESPONSE_INVALID:502 } as Record<string,number>)[code] ?? 500
      return response({error:{code,message:error instanceof AiError || error instanceof IdentityError ? error.message : 'Internal server error'},requestId},status)
    }
  }
}
