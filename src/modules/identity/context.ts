import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { rowAs } from '../../platform/database/rows.ts'
import { PERMISSIONS, SYSTEM_ROLES } from './permissions.ts'
import { conflict, forbidden, invalid, missing, unauthenticated } from './errors.ts'
import { identifier } from './validation.ts'
import type { Actor, AuditEvent, UserRow } from './types.ts'

interface SessionRow {
  session_id: string; company_id: string; user_id: string; username: string;
  display_name: string; csrf_token: string; expires_at: string; revoked_at: string | null;
  status: string; company_status: string; auth_version: number; issued_version: number
}
interface RoleRow { id: string; code: string; name: string }
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
/** Savepoint-aware unit of work shared by manual services and AI. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const sp = db.isTransaction ? `sp_${randomUUID().replaceAll('-', '')}` : null
  db.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE')
  try { const result = fn(); db.exec(sp ? `RELEASE SAVEPOINT ${sp}` : 'COMMIT'); return result }
  catch (error) {
    if (sp) { db.exec(`ROLLBACK TO SAVEPOINT ${sp}`); db.exec(`RELEASE SAVEPOINT ${sp}`) }
    else db.exec('ROLLBACK')
    throw error
  }
}
export function createIdentityContext(db: DatabaseSync, clock: () => Date = () => new Date()) {
  const now = () => clock().toISOString()
  const future = (milliseconds: number) => new Date(clock().getTime() + milliseconds).toISOString()
  const audit = ({ companyId, actorId = null, action, outcome = 'success', subjectType, subjectId = null, details = {} }: AuditEvent) => {
    db.prepare(`INSERT INTO security_audit(id,company_id,actor_user_id,action,outcome,subject_type,subject_id,details)
      VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(), companyId, actorId, action, outcome, subjectType, subjectId, JSON.stringify(details))
  }
  function currentSession(token: string): Actor {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unauthenticated()
    const s = rowAs<SessionRow>(db.prepare(`SELECT s.id AS session_id, s.csrf_token, s.company_id, s.user_id, u.username, u.display_name,
      u.auth_version, s.auth_version AS issued_version, s.expires_at, s.revoked_at, u.status, c.status AS company_status
      FROM sessions s JOIN users u ON u.id=s.user_id AND u.company_id=s.company_id
      JOIN companies c ON c.id=s.company_id WHERE s.token_hash=?`).get(sha256(token)))
    if (!s || s.revoked_at || s.expires_at <= now() || s.status !== 'active' || s.company_status !== 'active' || s.auth_version !== s.issued_version) throw unauthenticated()
    return { sessionId: s.session_id, companyId: s.company_id, userId: s.user_id, username: s.username, displayName: s.display_name, csrfToken: s.csrf_token }
  }
  function requirePermission(actor: Actor, permission: string, companyId?: string | null) {
    if (!Object.hasOwn(PERMISSIONS, permission)) throw invalid('Unknown permission')
    if (companyId !== undefined && companyId !== null) {
      identifier(companyId, 'companyId')
      // Do not reveal whether a company exists or not.
      if (companyId !== actor.companyId) throw missing()
    }
    const permitted = db.prepare(`SELECT 1 FROM user_role_assignments a
      JOIN role_permissions p ON p.company_id=a.company_id AND p.role_id=a.role_id
      WHERE a.company_id=? AND a.user_id=? AND p.permission_code=? LIMIT 1`).get(actor.companyId, actor.userId, permission)
    if (!permitted) throw forbidden()
    return true
  }
  function requireActor(token: string, permission: string, companyId?: string | null) {
    const actor = currentSession(token)
    requirePermission(actor, permission, companyId)
    return actor
  }
  function getUserInCompany(actor: Actor, userId: string) {
    identifier(userId, 'userId')
    const user = rowAs<UserRow>(db.prepare('SELECT * FROM users WHERE id=? AND company_id=?').get(userId, actor.companyId))
    if (!user) throw missing()
    return user
  }
  function roleInCompany(actor: Actor, roleId: string) {
    identifier(roleId, 'roleId')
    const role = rowAs<RoleRow>(db.prepare('SELECT id,code,name FROM roles WHERE id=? AND company_id=?').get(roleId, actor.companyId))
    if (!role) throw missing()
    return role
  }
  function grant(companyId: string, userId: string, roleId: string) {
    const prior = rowAs<{id:string}>(db.prepare('SELECT id FROM user_role_assignments WHERE company_id=? AND user_id=? AND role_id=?').get(companyId,userId,roleId))
    if (prior) return {id:prior.id,created:false}
    const id=randomUUID()
    db.prepare('INSERT INTO user_role_assignments(id,company_id,user_id,role_id) VALUES(?,?,?,?)').run(id,companyId,userId,roleId)
    return {id,created:true}
  }
  function guardLastAdmin(companyId: string, userId: string) {
    const has = db.prepare(`SELECT 1 FROM user_role_assignments a JOIN roles r ON r.company_id=a.company_id AND r.id=a.role_id
      WHERE a.company_id=? AND a.user_id=? AND r.code='company-admin'`).get(companyId,userId)
    if (!has) return
    const count = rowAs<{n:number}>(db.prepare(`SELECT COUNT(DISTINCT u.id) AS n FROM users u
      JOIN user_role_assignments a ON a.user_id=u.id AND a.company_id=u.company_id
      JOIN roles r ON r.company_id=a.company_id AND r.id=a.role_id
      WHERE u.company_id=? AND u.status='active' AND r.code='company-admin'`).get(companyId))?.n ?? 0
    if (count<=1) throw conflict('Cannot remove the last active company administrator')
  }
  function installRoles(companyId: string) {
    const ids = new Map<string,string>()
    for (const role of SYSTEM_ROLES) {
      const id=randomUUID()
      db.prepare('INSERT INTO roles(id,company_id,code,name,system_role) VALUES(?,?,?,?,1)').run(id,companyId,role.code,role.name)
      for (const p of role.permissions) db.prepare('INSERT INTO role_permissions(company_id,role_id,permission_code) VALUES(?,?,?)').run(companyId,id,p)
      ids.set(role.code,id)
    }
    return ids
  }
  return {db,now,future,audit,currentSession,requirePermission,requireActor,getUserInCompany,roleInCompany,grant,guardLastAdmin,installRoles,transaction}
}
export type IdentityContext = ReturnType<typeof createIdentityContext>
