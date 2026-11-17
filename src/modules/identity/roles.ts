import {randomUUID} from 'node:crypto'
import {rowAs,rowsAs} from '../../platform/database/rows.ts'
import {PERMISSIONS} from './permissions.ts'
import {code,requiredString,identifier} from './validation.ts'
import {conflict,invalid,IdentityError} from './errors.ts'
import type {AuthInput,UserIdInput,RoleInput} from './types.ts'
import type {IdentityContext} from './context.ts'
interface AssignmentRow {id:string;user_id:string;role_id:string;role_code:string}
export function createRoleService(ctx:IdentityContext) {
  const {db,audit,grant,transaction,requireActor,currentSession,getUserInCompany,roleInCompany,guardLastAdmin,requirePermission}=ctx
  function createRole({sessionToken,code:roleCode,name,permissions}:RoleInput) {
    roleCode=code(roleCode,'Role code');name=requiredString(name,'Role name')
    if (!Array.isArray(permissions)||!permissions.length||new Set(permissions).size!==permissions.length ||
      permissions.some(p=>!Object.hasOwn(PERMISSIONS,p))) throw invalid('Invalid role permissions')
    return transaction(db,()=>{
      const a=requireActor(sessionToken,'roles.manage')
      if (db.prepare('SELECT 1 FROM roles WHERE company_id=? AND code=?').get(a.companyId,roleCode)) throw conflict('Role already exists')
      const id=randomUUID()
      db.prepare('INSERT INTO roles(id,company_id,code,name,system_role) VALUES(?,?,?,?,0)').run(id,a.companyId,roleCode,name)
      for(const p of permissions) db.prepare('INSERT INTO role_permissions(company_id,role_id,permission_code) VALUES(?,?,?)').run(a.companyId,id,p)
      audit({companyId:a.companyId,actorId:a.userId,action:'role.create',subjectType:'role',subjectId:id})
      return {id,code:roleCode,name,permissions}
    })
  }
  function assignRole({sessionToken,userId,roleId}:AuthInput & {userId:string;roleId:string}) {
    return transaction(db,()=>{
      const a=requireActor(sessionToken,'roles.manage')
      getUserInCompany(a,userId);roleInCompany(a,roleId)
      const result=grant(a.companyId,userId,roleId)
      if(result.created) audit({companyId:a.companyId,actorId:a.userId,action:'role.assign',subjectType:'user',subjectId:userId,details:{roleId}})
      return result
    })
  }
  function revokeRole({sessionToken,assignmentId}:AuthInput & {assignmentId:string}) {
    identifier(assignmentId,'assignmentId')
    return transaction(db,()=>{
      const a=requireActor(sessionToken,'roles.manage')
      const assignment=rowAs<AssignmentRow>(db.prepare(`SELECT a.id,a.user_id,a.role_id,r.code AS role_code
        FROM user_role_assignments a JOIN roles r ON r.company_id=a.company_id AND r.id=a.role_id
        WHERE a.company_id=? AND a.id=?`).get(a.companyId,assignmentId))
      if (!assignment) throw invalid('Role assignment not found')
      if(assignment.role_code==='company-admin') guardLastAdmin(a.companyId,assignment.user_id)
      db.prepare('DELETE FROM user_role_assignments WHERE company_id=? AND id=?').run(a.companyId,assignmentId)
      audit({companyId:a.companyId,actorId:a.userId,action:'role.revoke',subjectType:'user',subjectId:assignment.user_id,details:{roleId:assignment.role_id}})
      return {ok:true}
    })
  }
  function listRoles({sessionToken}:AuthInput) {
    const a=requireActor(sessionToken,'users.read')
    return rowsAs<{id:string;code:string;name:string;system_role:number}>(db.prepare('SELECT id,code,name,system_role FROM roles WHERE company_id=? ORDER BY code').all(a.companyId))
  }
  function listAssignments({sessionToken,userId}:UserIdInput) {
    const a=requireActor(sessionToken,'users.read')
    getUserInCompany(a,userId)
    return rowsAs<{id:string;role_id:string;role_code:string}>(db.prepare(`SELECT a.id,a.role_id,r.code AS role_code FROM user_role_assignments a
      JOIN roles r ON r.company_id=a.company_id AND r.id=a.role_id WHERE a.company_id=? AND a.user_id=? ORDER BY r.code`).all(a.companyId,userId))
  }
  function hasPermission({sessionToken,permission,companyId}:AuthInput & {permission:string;companyId?:string}) {
    const a=currentSession(sessionToken)
    try {return requirePermission(a,permission,companyId)}
    catch(error){if(error instanceof IdentityError && (error.code==='PERMISSION_DENIED'||error.code==='NOT_FOUND'))return false;throw error}
  }
  function readAudit({sessionToken,limit=50}:AuthInput & {limit?:number}) {
    if(!Number.isInteger(limit)||limit<1||limit>200) throw invalid('Audit limit must be 1–200')
    const a=requireActor(sessionToken,'audit.read')
    return rowsAs<{id:string;company_id:string;actor_user_id:string|null;action:string;outcome:string;subject_type:string;subject_id:string|null;created_at:string}>
      (db.prepare('SELECT id,company_id,actor_user_id,action,outcome,subject_type,subject_id,created_at FROM security_audit WHERE company_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(a.companyId,limit))
  }
  return Object.freeze({createRole,assignRole,revokeRole,listRoles,listAssignments,hasPermission,readAudit})
}
