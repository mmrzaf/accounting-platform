import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { rowAs } from '../../platform/database/rows.ts'
import { PERMISSIONS, SYSTEM_ROLES } from './permissions.ts'
import type { Permission, RoleScope } from './permissions.ts'
import { conflict, forbidden, invalid, missing, unauthenticated } from './errors.ts'
import { identifier } from './validation.ts'
import type { Actor, AuditEvent, UserRow } from './types.ts'

interface SessionRow {
  session_id: string; organization_id: string; user_id: string; username: string
  display_name: string; csrf_token: string; expires_at: string; revoked_at: string | null
  status: string; org_status: string; auth_version: number; issued_version: number
}
interface RoleRow { id: string; scope: RoleScope; code: string; name: string }

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
export { sha256 }

/** Allow application-level atomic AI execution to compose existing transactional services.
 * Nested operations use unique SQLite savepoints; an outer rollback reverts all effects.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const savepoint = db.isTransaction ? `sp_${randomUUID().replaceAll('-', '')}` : null
  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT')
    return result
  } catch (error) {
    if (savepoint) {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
      db.exec(`RELEASE SAVEPOINT ${savepoint}`)
    } else db.exec('ROLLBACK')
    throw error
  }
}

export function createIdentityContext(db: DatabaseSync, clock: () => Date = () => new Date()) {
  const now = () => clock().toISOString()
  const future = (milliseconds: number) => new Date(clock().getTime() + milliseconds).toISOString()
  const audit = ({ organizationId, companyId = null, actorId = null, action, outcome = 'success', subjectType, subjectId = null, details = {} }: AuditEvent) => {
    db.prepare(`INSERT INTO security_audit(id,organization_id,company_id,actor_user_id,action,outcome,subject_type,subject_id,details)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(), organizationId, companyId, actorId, action, outcome, subjectType, subjectId, JSON.stringify(details))
  }
  function currentSession(token: string): Actor {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unauthenticated()
    const session = rowAs<SessionRow>(db.prepare(`SELECT s.id AS session_id, s.csrf_token, s.organization_id, s.user_id, u.username, u.display_name,
         u.auth_version, s.auth_version AS issued_version, s.expires_at, s.revoked_at, u.status, o.status AS org_status
         FROM sessions s JOIN users u ON u.id=s.user_id AND u.organization_id=s.organization_id
         JOIN organizations o ON o.id=s.organization_id WHERE s.token_hash=?`).get(sha256(token)))
    if (!session || session.revoked_at || session.expires_at <= now() || session.status !== 'active' || session.org_status !== 'active' || session.auth_version !== session.issued_version) throw unauthenticated()
    return { sessionId: String(session.session_id), organizationId: String(session.organization_id), userId: String(session.user_id), username: String(session.username), displayName: String(session.display_name), csrfToken: String(session.csrf_token) }
  }
  function requirePermission(actor: Actor, permission: string, companyId: string | null = null) {
    const scope = Object.hasOwn(PERMISSIONS, permission) ? PERMISSIONS[permission as Permission] : undefined
    if (!scope) throw invalid('Unknown permission')
    if (scope === 'company') {
      identifier(companyId, 'companyId')
      const company = db.prepare('SELECT id FROM companies WHERE id=? AND organization_id=? AND status=?').get(companyId, actor.organizationId, 'active')
      if (!company) throw missing()
    } else if (companyId !== null) throw invalid('Organization permission cannot be company-scoped')
    const allowed = db.prepare(`SELECT 1 AS allowed FROM user_role_assignments a
      JOIN roles r ON r.id=a.role_id AND r.organization_id=a.organization_id AND r.scope=a.scope
      JOIN role_permissions p ON p.organization_id=r.organization_id AND p.role_id=r.id AND p.scope=r.scope
      WHERE a.organization_id=? AND a.user_id=? AND a.scope=? AND a.company_id IS ? AND p.permission_code=? LIMIT 1`)
      .get(actor.organizationId, actor.userId, scope, companyId, permission)
    if (!allowed) throw forbidden()
    return true
  }
  function requireActor(sessionToken: string, permission: string, companyId: string | null = null) {
    const actor = currentSession(sessionToken)
    requirePermission(actor, permission, companyId)
    return actor
  }
  function getUserInOrg(actor: Actor, userId: string) {
    identifier(userId, 'userId')
    const user = rowAs<UserRow>(db.prepare('SELECT * FROM users WHERE id=? AND organization_id=?').get(userId, actor.organizationId))
    if (!user) throw missing()
    return user
  }
  function roleInOrg(actor: Actor, roleId: string) {
    identifier(roleId, 'roleId')
    const role = rowAs<RoleRow>(db.prepare('SELECT * FROM roles WHERE id=? AND organization_id=?').get(roleId, actor.organizationId))
    if (!role) throw missing()
    return role
  }
  function grant(orgId: string, userId: string, roleId: string, scope: RoleScope, companyId: string | null = null) {
    const already = rowAs<{ id: string }>(db.prepare('SELECT id FROM user_role_assignments WHERE organization_id=? AND user_id=? AND role_id=? AND company_id IS ?').get(orgId, userId, roleId, companyId))
    if (already) return { id: already.id, created: false }
    const id = randomUUID()
    db.prepare('INSERT INTO user_role_assignments(id, organization_id, user_id, role_id, scope, company_id) VALUES(?,?,?,?,?,?)')
      .run(id, orgId, userId, roleId, scope, companyId)
    return { id, created: true }
  }
  function guardLastAdmin(orgId: string, userId: string) {
    const admin = db.prepare(`SELECT 1 FROM user_role_assignments a JOIN roles r ON r.id=a.role_id AND r.organization_id=a.organization_id
        WHERE a.organization_id=? AND a.user_id=? AND r.scope='organization' AND r.code='organization-admin' LIMIT 1`).get(orgId, userId)
    if (!admin) return
    const count = rowAs<{ n: number }>(db.prepare(`SELECT count(DISTINCT u.id) AS n FROM users u JOIN user_role_assignments a ON a.user_id=u.id AND a.organization_id=u.organization_id
        JOIN roles r ON r.id=a.role_id AND r.organization_id=a.organization_id
        WHERE u.organization_id=? AND u.status='active' AND r.scope='organization' AND r.code='organization-admin'`).get(orgId))?.n ?? 0
    if (count <= 1) throw conflict('Cannot remove or disable the last active organization administrator')
  }
  function installRoles(orgId: string) {
    const ids = new Map<string, string>()
    for (const role of SYSTEM_ROLES) {
      const id = randomUUID()
      db.prepare('INSERT INTO roles(id,organization_id,scope,code,name,system_role) VALUES(?,?,?,?,?,1)').run(id, orgId, role.scope, role.code, role.name)
      for (const permission of role.permissions) db.prepare('INSERT INTO role_permissions(organization_id,role_id,scope,permission_code) VALUES(?,?,?,?)').run(orgId, id, role.scope, permission)
      ids.set(role.code, id)
    }
    return ids
  }

  return { db, now, future, audit, currentSession, requirePermission, requireActor,
    getUserInOrg, roleInOrg, grant, guardLastAdmin, installRoles, transaction }
}
export type IdentityContext = ReturnType<typeof createIdentityContext>
