import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {rowAs} from '../../platform/database/rows.ts'
import {hashPassword,verifyPassword} from './passwords.ts'
import {code,passwordValue} from './validation.ts'
import {conflict,forbidden,unauthenticated} from './errors.ts'
import {sha256} from './context.ts'
import {publicUser} from './presenters.ts'
import type {UserRow,LoginInput,AuthInput} from './types.ts'
import type {IdentityContext} from './context.ts'
interface ThrottleRow { failures:number; window_started_at:string; locked_until:string|null }
const SESSION_MS=12*60*60*1000, LOCK_WINDOW_MS=15*60*1000, MAX_FAILURES=5
export function createSessionService(ctx:IdentityContext) {
  const {db,now,future,audit,transaction,currentSession}=ctx
  let dummyHash:string|undefined
  async function login({username,password}:LoginInput) {
    username=code(username,'Username')
    if (typeof password!=='string') throw unauthenticated()
    const user=rowAs<UserRow & {company_status:string}>(db.prepare(`SELECT u.*,c.status AS company_status
      FROM users u JOIN companies c ON c.id=u.company_id WHERE u.username=?`).get(username))
    dummyHash??=await hashPassword('dummy-password-not-for-login')
    const valid=await verifyPassword(password,user?.password_hash??dummyHash)
    const result=transaction(db,()=>{
      const entry=rowAs<ThrottleRow>(db.prepare('SELECT failures,window_started_at,locked_until FROM login_throttles WHERE username=?').get(username))
      const at=now()
      if (entry?.locked_until && entry.locked_until>at) return null
      const fresh=entry && Date.parse(at)-Date.parse(entry.window_started_at)<LOCK_WINDOW_MS
      if (!valid || !user || user.status!=='active' || user.company_status!=='active') {
        const failures=(fresh?entry.failures:0)+1
        db.prepare(`INSERT INTO login_throttles(username,failures,window_started_at,locked_until) VALUES(?,?,?,?)
          ON CONFLICT(username) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until`)
          .run(username,failures,fresh?entry.window_started_at:at,failures>=MAX_FAILURES?future(LOCK_WINDOW_MS):null)
        if (user) audit({companyId:user.company_id,action:'session.login',outcome:'failure',subjectType:'session'})
        return null
      }
      const current=rowAs<Pick<UserRow,'password_hash'|'status'|'auth_version'>>(db.prepare('SELECT password_hash,status,auth_version FROM users WHERE id=? AND company_id=?').get(user.id,user.company_id))
      if (!current || current.status!=='active' || current.password_hash!==user.password_hash) throw unauthenticated()
      db.prepare('DELETE FROM login_throttles WHERE username=?').run(username)
      const token=randomBytes(32).toString('base64url'),csrfToken=randomBytes(32).toString('base64url')
      const id=randomUUID(),expiresAt=future(SESSION_MS)
      db.prepare('INSERT INTO sessions(id,token_hash,csrf_token,company_id,user_id,auth_version,expires_at) VALUES(?,?,?,?,?,?,?)')
        .run(id,sha256(token),csrfToken,user.company_id,user.id,current.auth_version,expiresAt)
      audit({companyId:user.company_id,actorId:user.id,action:'session.login',subjectType:'session',subjectId:id})
      return {token,csrfToken,expiresAt,user:publicUser(user)}
    })
    if (!result) throw unauthenticated()
    return result
  }
  function verifyCsrf(sessionToken:string,csrfToken:string|null) {
    const actor=currentSession(sessionToken)
    if (typeof csrfToken!=='string' || csrfToken.length!==actor.csrfToken.length ||
      !timingSafeEqual(Buffer.from(csrfToken),Buffer.from(actor.csrfToken))) throw forbidden()
    return actor
  }
  function me(sessionToken:string) {
    const actor=currentSession(sessionToken)
    const company=rowAs<{id:string;name:string}>(db.prepare('SELECT id,name FROM companies WHERE id=?').get(actor.companyId))
    if (!company) throw unauthenticated()
    return {user:{id:actor.userId,username:actor.username,displayName:actor.displayName},company,csrfToken:actor.csrfToken}
  }
  function logout(sessionToken:string) {
    return transaction(db,()=>{const a=currentSession(sessionToken)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(),a.sessionId)
      audit({companyId:a.companyId,actorId:a.userId,action:'session.logout',subjectType:'session',subjectId:a.sessionId})
      return {ok:true}
    })
  }
  async function changePassword({sessionToken,oldPassword,newPassword}:AuthInput & {oldPassword:string;newPassword:string}) {
    passwordValue(newPassword)
    const a=currentSession(sessionToken)
    const user=rowAs<Pick<UserRow,'password_hash'>>(db.prepare('SELECT password_hash FROM users WHERE id=? AND company_id=?').get(a.userId,a.companyId))
    if (!user || !await verifyPassword(oldPassword,user.password_hash)) throw unauthenticated()
    const hashed=await hashPassword(newPassword)
    return transaction(db,()=>{
      const live=currentSession(sessionToken)
      const current=rowAs<Pick<UserRow,'password_hash'>>(db.prepare('SELECT password_hash FROM users WHERE id=? AND company_id=?').get(live.userId,live.companyId))
      if (!current || current.password_hash!==user.password_hash) throw conflict('Password changed concurrently')
      db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=? AND company_id=?').run(hashed,live.userId,live.companyId)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE company_id=? AND user_id=? AND revoked_at IS NULL').run(now(),live.companyId,live.userId)
      audit({companyId:live.companyId,actorId:live.userId,action:'user.password_changed',subjectType:'user',subjectId:live.userId})
      return {ok:true,mustLoginAgain:true}
    })
  }
  return Object.freeze({login,logout,me,verifyCsrf,changePassword})
}
