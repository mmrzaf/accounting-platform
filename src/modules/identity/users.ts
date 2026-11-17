import {randomUUID} from 'node:crypto'
import {rowsAs} from '../../platform/database/rows.ts'
import {hashPassword} from './passwords.ts'
import {code,requiredString,passwordValue,requestedStatus} from './validation.ts'
import {conflict} from './errors.ts'
import {publicUser} from './presenters.ts'
import type {UserRow,AuthInput,UserIdInput} from './types.ts'
import type {IdentityContext} from './context.ts'

export function createUserService(ctx:IdentityContext) {
  const {db,now,audit,transaction,requireActor,getUserInCompany,guardLastAdmin}=ctx
  async function createUser({sessionToken,username,displayName,password}:AuthInput & {username:string;displayName:string;password:string}) {
    username=code(username,'Username');displayName=requiredString(displayName,'Display name')
    const a=requireActor(sessionToken,'users.manage')
    const hashed=await hashPassword(password)
    return transaction(db,()=>{
      requireActor(sessionToken,'users.manage')
      if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw conflict('Username already exists')
      const id=randomUUID()
      db.prepare('INSERT INTO users(id,company_id,username,display_name,password_hash) VALUES(?,?,?,?,?)')
        .run(id,a.companyId,username,displayName,hashed)
      audit({companyId:a.companyId,actorId:a.userId,action:'user.create',subjectType:'user',subjectId:id})
      return {id,username,displayName,status:'active'}
    })
  }
  function listUsers({sessionToken}:AuthInput) {
    const a=requireActor(sessionToken,'users.read')
    return rowsAs<UserRow>(db.prepare('SELECT id,username,display_name,status FROM users WHERE company_id=? ORDER BY username').all(a.companyId)).map(publicUser)
  }
  function setUserStatus({sessionToken,userId,status}:UserIdInput & {status:'active'|'disabled'}) {
    status=requestedStatus(status)
    return transaction(db,()=>{
      const a=requireActor(sessionToken,'users.manage'),target=getUserInCompany(a,userId)
      if (status==='disabled' && a.userId===userId) throw conflict('Cannot disable yourself')
      if (status==='disabled' && target.status==='active') guardLastAdmin(a.companyId,userId)
      if (target.status===status) return publicUser(target)
      db.prepare('UPDATE users SET status=?,auth_version=auth_version+1 WHERE company_id=? AND id=?').run(status,a.companyId,userId)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE company_id=? AND user_id=? AND revoked_at IS NULL').run(now(),a.companyId,userId)
      audit({companyId:a.companyId,actorId:a.userId,action:`user.${status}`,subjectType:'user',subjectId:userId})
      return {...publicUser(target),status}
    })
  }
  async function resetUserPassword({sessionToken,userId,newPassword}:UserIdInput & {newPassword:string}) {
    passwordValue(newPassword)
    const a=requireActor(sessionToken,'users.manage')
    getUserInCompany(a,userId)
    const hashed=await hashPassword(newPassword)
    return transaction(db,()=>{
      requireActor(sessionToken,'users.manage');getUserInCompany(a,userId)
      db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE company_id=? AND id=?').run(hashed,a.companyId,userId)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE company_id=? AND user_id=? AND revoked_at IS NULL').run(now(),a.companyId,userId)
      db.prepare('DELETE FROM login_throttles WHERE username=(SELECT username FROM users WHERE id=? AND company_id=?)').run(userId,a.companyId)
      audit({companyId:a.companyId,actorId:a.userId,action:'user.password_reset',subjectType:'user',subjectId:userId})
      return {ok:true,sessionsRevoked:true}
    })
  }
  function unlockUser({sessionToken,userId}:UserIdInput) {
    return transaction(db,()=>{const a=requireActor(sessionToken,'users.manage'),target=getUserInCompany(a,userId)
      db.prepare('DELETE FROM login_throttles WHERE username=?').run(target.username)
      audit({companyId:a.companyId,actorId:a.userId,action:'user.unlock',subjectType:'user',subjectId:userId})
      return {ok:true}
    })
  }
  return Object.freeze({createUser,listUsers,setUserStatus,resetUserPassword,unlockUser})
}
