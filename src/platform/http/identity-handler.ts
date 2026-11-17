import {randomUUID} from 'node:crypto'
import type {createIdentityService} from '../../modules/identity/service.ts'
import {IdentityError,unauthenticated,invalid} from '../../modules/identity/errors.ts'
import {requiredString,code as validatedCode,identifier,requestedStatus} from '../../modules/identity/validation.ts'
import {response,bearerCookie,cookieHeader,clearCookie,parseJson,assertSameOrigin,assertLocalOrTls} from './request-security.ts'
const passwordInput=(value:unknown):string=>{if(typeof value!=='string')throw invalid('Password must be a string');return value}
function userInput(body:Record<string,unknown>){return {username:validatedCode(body['username'],'Username'),displayName:requiredString(body['displayName'],'Display name'),password:passwordInput(body['password'])}}
function roleInput(body:Record<string,unknown>){const permissions=body['permissions'];if(!Array.isArray(permissions)||!permissions.every(p=>typeof p==='string'))throw invalid('Invalid permissions');return {code:validatedCode(body['code'],'Role code'),name:requiredString(body['name'],'Role name'),permissions:permissions as string[]}}
/** Each authenticated request derives its company from the session; no client-supplied scope. */
export function createIdentityHttpHandler(identity:ReturnType<typeof createIdentityService>) {
  return async(request:Request):Promise<Response>=>{
    const requestId=randomUUID()
    try{
      const url=new URL(request.url),secure=assertLocalOrTls(url),method=request.method.toUpperCase()
      if(!url.pathname.startsWith('/api/') || !['GET','POST','PATCH'].includes(method)) return response({error:{code:'NOT_FOUND',message:'Not found'},requestId},404)
      if(method!=='GET')assertSameOrigin(request,url)
      if(method==='POST' && url.pathname==='/api/auth/login'){
        const body=await parseJson(request)
        const login=await identity.login({username:validatedCode(body['username'],'Username'),password:passwordInput(body['password'])})
        return response({user:login.user,csrfToken:login.csrfToken,expiresAt:login.expiresAt},200,{'Set-Cookie':cookieHeader(login.token,secure)})
      }
      const token=bearerCookie(request,secure)
      if(!token)throw unauthenticated()
      const session=identity.me(token)
      if(method==='GET' && url.pathname==='/api/auth/session')return response(session)
      if(method!=='GET')identity.verifyCsrf(token,request.headers.get('x-csrf-token'))
      if(method==='POST' && url.pathname==='/api/auth/logout'){identity.logout(token);return response({ok:true},200,{'Set-Cookie':clearCookie(secure)})}
      if(method==='POST' && url.pathname==='/api/auth/password'){
        const body=await parseJson(request)
        return response(await identity.changePassword({sessionToken:token,oldPassword:passwordInput(body['oldPassword']),newPassword:passwordInput(body['newPassword'])}),200,{'Set-Cookie':clearCookie(secure)})
      }
      if(method==='GET' && url.pathname==='/api/company')return response(identity.readCompany({sessionToken:token}))
      if(method==='PATCH' && url.pathname==='/api/company')return response(identity.renameCompany({sessionToken:token,name:requiredString((await parseJson(request))['name'],'Company name')}))
      if(method==='GET' && url.pathname==='/api/users')return response({items:identity.listUsers({sessionToken:token})})
      if(method==='POST' && url.pathname==='/api/users')return response(await identity.createUser({sessionToken:token,...userInput(await parseJson(request))}),201)
      if(method==='PATCH' && /^\/api\/users\/[0-9a-f-]+\/status$/u.test(url.pathname))return response(identity.setUserStatus({sessionToken:token,userId:identifier(url.pathname.split('/')[3]),status:requestedStatus((await parseJson(request))['status'])}))
      if(method==='POST' && /^\/api\/users\/[0-9a-f-]+\/reset-password$/u.test(url.pathname))return response(await identity.resetUserPassword({sessionToken:token,userId:identifier(url.pathname.split('/')[3]),newPassword:passwordInput((await parseJson(request))['newPassword'])}))
      if(method==='POST' && /^\/api\/users\/[0-9a-f-]+\/unlock$/u.test(url.pathname))return response(identity.unlockUser({sessionToken:token,userId:identifier(url.pathname.split('/')[3])}))
      if(method==='GET' && url.pathname==='/api/roles')return response({items:identity.listRoles({sessionToken:token})})
      if(method==='POST' && url.pathname==='/api/roles')return response(identity.createRole({sessionToken:token,...roleInput(await parseJson(request))}),201)
      if(method==='POST' && url.pathname==='/api/roles/assign'){
        const body=await parseJson(request);return response(identity.assignRole({sessionToken:token,userId:identifier(body['userId']),roleId:identifier(body['roleId'])}))
      }
      if(method==='POST' && url.pathname==='/api/roles/revoke')return response(identity.revokeRole({sessionToken:token,assignmentId:identifier((await parseJson(request))['assignmentId'])}))
      if(method==='GET' && url.pathname==='/api/roles/assignments')return response({items:identity.listAssignments({sessionToken:token,userId:identifier(url.searchParams.get('userId'))})})
      if(method==='GET' && url.pathname==='/api/audit'){
        const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):50
        return response({items:identity.readAudit({sessionToken:token,limit})})
      }
      return response({error:{code:'NOT_FOUND',message:'Not found'},requestId},404)
    }catch(error){const code=error instanceof IdentityError?error.code:'INTERNAL_ERROR'
      const status=({VALIDATION_FAILED:400,NOT_AUTHENTICATED:401,PERMISSION_DENIED:403,NOT_FOUND:404,CONFLICT:409} as Record<string,number>)[code]??500
      return response({error:{code,message:error instanceof IdentityError?error.message:'Internal server error'},requestId},status)
    }
  }
}
