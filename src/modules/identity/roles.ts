import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { PERMISSIONS } from './permissions.ts'
import type { Permission, RoleScope } from './permissions.ts'
import { code, requiredString, identifier } from './validation.ts'
import { conflict, invalid, missing, IdentityError } from './errors.ts'
import type { AuthInput, UserIdInput, RoleInput } from './types.ts'

interface AssignmentRow {
  id: string; scope: RoleScope; role_code: string; user_id: string;
  company_id: string | null; role_id: string
}
import type { IdentityContext } from './context.ts'

/** Scoped application use cases; no direct framework or HTTP dependency. */
export function createRoleService(ctx: IdentityContext) {
  const { db, audit, grant, transaction, requireActor, currentSession, getUserInOrg, roleInOrg, guardLastAdmin, requirePermission } = ctx
  function createRole({ sessionToken, scope, code: roleCode, name, permissions }: RoleInput) {
    if (scope !== 'organization' && scope !== 'company') throw invalid('Invalid role scope')
    roleCode = code(roleCode, 'Role code')
    name = requiredString(name, 'Role name')
    if (!Array.isArray(permissions) || permissions.length === 0 || new Set(permissions).size !== permissions.length || permissions.some(p => !Object.hasOwn(PERMISSIONS, p) || PERMISSIONS[p as Permission] !== scope)) throw invalid('Permissions must be unique, known and match role scope')
    return transaction(db, () => {
      const actor = requireActor(sessionToken, 'roles.manage')
      if (db.prepare('SELECT 1 FROM roles WHERE organization_id=? AND scope=? AND code=?').get(actor.organizationId, scope, roleCode)) throw conflict('Role already exists')
      const id = randomUUID()
      db.prepare('INSERT INTO roles(id,organization_id,scope,code,name,system_role) VALUES(?,?,?,?,?,0)').run(id, actor.organizationId, scope, roleCode, name)
      for (const permission of permissions) db.prepare('INSERT INTO role_permissions(organization_id,role_id,scope,permission_code) VALUES(?,?,?,?)').run(actor.organizationId, id, scope, permission)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, action: 'role.create', subjectType: 'role', subjectId: id, details: { scope } })
      return { id, scope, code: roleCode, name, permissions }
    })
  }
  function assignRole({ sessionToken, userId, roleId, companyId = null }: AuthInput & { userId: string; roleId: string; companyId?: string | null }) {
    return transaction(db, () => {
      const actor = requireActor(sessionToken, 'roles.manage')
      getUserInOrg(actor, userId)
      const role = roleInOrg(actor, roleId)
      if ((role.scope === 'company') !== (companyId !== null)) throw invalid('Role scope and company assignment must match')
      if (companyId !== null) {
        identifier(companyId, 'companyId')
        if (!db.prepare("SELECT 1 FROM companies WHERE organization_id=? AND id=? AND status='active'").get(actor.organizationId, companyId)) throw missing()
      }
      const result = grant(actor.organizationId, userId, roleId, role.scope, companyId)
      if (result.created) audit({ organizationId: actor.organizationId, actorId: actor.userId, companyId, action: 'role.assign', subjectType: 'user', subjectId: userId, details: { roleId } })
      return result
    })
  }
  function revokeRole({ sessionToken, assignmentId }: AuthInput & { assignmentId: string }) {
    identifier(assignmentId, 'assignmentId')
    return transaction(db, () => {
      const actor = requireActor(sessionToken, 'roles.manage')
      const assignment = rowAs<AssignmentRow>(db.prepare(`SELECT a.*, r.code AS role_code FROM user_role_assignments a
        JOIN roles r ON r.id=a.role_id AND r.organization_id=a.organization_id WHERE a.organization_id=? AND a.id=?`).get(actor.organizationId, assignmentId))
      if (!assignment) throw missing()
      if (assignment.scope === 'organization' && assignment.role_code === 'organization-admin') guardLastAdmin(actor.organizationId, assignment.user_id)
      db.prepare('DELETE FROM user_role_assignments WHERE organization_id=? AND id=?').run(actor.organizationId, assignmentId)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, companyId: assignment.company_id, action: 'role.revoke', subjectType: 'user', subjectId: assignment.user_id, details: { roleId: assignment.role_id } })
      return { ok: true }
    })
  }
  function listRoles({ sessionToken }: AuthInput) {
    const actor = requireActor(sessionToken, 'users.read')
    return rowsAs<{ id: string; code: string; name: string; scope: RoleScope; system_role: number }>(db.prepare('SELECT id,code,name,scope,system_role FROM roles WHERE organization_id=? ORDER BY scope,code').all(actor.organizationId))
  }
  function listAssignments({ sessionToken, userId }: UserIdInput) {
    const actor = requireActor(sessionToken, 'users.read')
    getUserInOrg(actor, userId)
    return rowsAs<{ id: string; role_id: string; scope: RoleScope; company_id: string | null; role_code: string }>(db.prepare('SELECT a.id,a.role_id,a.scope,a.company_id,r.code AS role_code FROM user_role_assignments a JOIN roles r ON r.id=a.role_id AND r.organization_id=a.organization_id WHERE a.organization_id=? AND a.user_id=? ORDER BY r.code').all(actor.organizationId, userId))
  }
  function hasPermission({ sessionToken, permission, companyId = null }: AuthInput & { permission: string; companyId?: string | null }) {
    const actor = currentSession(sessionToken)
    try { return requirePermission(actor, permission, companyId) } catch (error) {
      if (error instanceof IdentityError && (error.code === 'PERMISSION_DENIED' || error.code === 'NOT_FOUND')) return false
      throw error
    }
  }
  function readAudit({ sessionToken, limit = 50 }: AuthInput & { limit?: number }) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw invalid('Audit limit must be 1–200')
    const actor = requireActor(sessionToken, 'audit.read')
    return rowsAs<{ id: string; organization_id: string; company_id: string | null; actor_user_id: string | null; action: string; outcome: string; subject_type: string; subject_id: string | null; created_at: string }>(db.prepare('SELECT id,organization_id,company_id,actor_user_id,action,outcome,subject_type,subject_id,created_at FROM security_audit WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(actor.organizationId, limit))
  }
  return Object.freeze({ createRole, assignRole, revokeRole, listRoles, listAssignments, hasPermission, readAudit })
}
