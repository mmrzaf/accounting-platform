import { randomUUID } from 'node:crypto'
import { hashPassword } from './passwords.ts'
import { code, requiredString } from './validation.ts'
import { conflict } from './errors.ts'
import type { BootstrapInput } from './types.ts'
import type { IdentityContext } from './context.ts'

/** Installation-only company bootstrap. There is no public registration or company switching. */
export function createBootstrapService(ctx: IdentityContext) {
  const {db,audit,grant,installRoles,transaction} = ctx
  async function bootstrapCompany({name,adminUsername,adminDisplayName,password}:BootstrapInput) {
    name=requiredString(name,'Company name')
    adminUsername=code(adminUsername,'Username')
    adminDisplayName=requiredString(adminDisplayName,'Administrator name')
    const hashed=await hashPassword(password)
    return transaction(db,()=>{
      if (db.prepare('SELECT 1 FROM users WHERE username=?').get(adminUsername)) throw conflict('Username already exists')
      const companyId=randomUUID(), userId=randomUUID()
      db.prepare('INSERT INTO companies(id,name) VALUES(?,?)').run(companyId,name)
      db.prepare('INSERT INTO users(id,company_id,username,display_name,password_hash) VALUES(?,?,?,?,?)')
        .run(userId,companyId,adminUsername,adminDisplayName,hashed)
      const roles=installRoles(companyId)
      grant(companyId,userId,roles.get('company-admin')!)
      audit({companyId,actorId:userId,action:'company.bootstrap',subjectType:'company',subjectId:companyId})
      return {company:{id:companyId,name},administrator:{id:userId,username:adminUsername,displayName:adminDisplayName}}
    })
  }
  return Object.freeze({bootstrapCompany})
}
