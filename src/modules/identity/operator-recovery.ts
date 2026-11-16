import type { DatabaseSync } from 'node:sqlite'
import { rowAs } from '../../platform/database/rows.ts'
import { randomUUID } from 'node:crypto'
import { hashPassword } from './passwords.ts'
import { code } from './validation.ts'
import { missing } from './errors.ts'

/** Local installation-operator recovery. Never mount this privileged function on HTTP or AI tools.
 * A person with DB file access is already a trusted installation administrator.
 */
export async function recoverOrganizationAdministrator(db: DatabaseSync, { organizationSlug, username, newPassword }: { organizationSlug: string; username: string; newPassword: string }) {
  organizationSlug = code(organizationSlug, 'Organization slug')
  username = code(username, 'Username')
  const target = rowAs<{ organization_id: string; user_id: string }>(db.prepare(`SELECT o.id AS organization_id, u.id AS user_id FROM organizations o
    JOIN users u ON u.organization_id=o.id
    JOIN user_role_assignments a ON a.organization_id=u.organization_id AND a.user_id=u.id AND a.scope='organization'
    JOIN roles r ON r.organization_id=a.organization_id AND r.id=a.role_id
    WHERE o.slug=? AND u.username=? AND r.code='organization-admin' AND r.scope='organization'`).get(organizationSlug, username))
  if (!target) throw missing()
  const hash = await hashPassword(newPassword)
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = db.prepare(`UPDATE users SET password_hash=?, auth_version=auth_version+1, status='active'
      WHERE id=? AND organization_id=?`).run(hash, target.user_id, target.organization_id)
    if (result.changes !== 1) throw missing()
    db.prepare('UPDATE sessions SET revoked_at=? WHERE organization_id=? AND user_id=? AND revoked_at IS NULL')
      .run(new Date().toISOString(), target.organization_id, target.user_id)
    db.prepare('DELETE FROM login_throttles WHERE organization_id=? AND username=?').run(target.organization_id, username)
    db.prepare('INSERT INTO security_audit(id,organization_id,actor_user_id,action,outcome,subject_type,subject_id,details) VALUES(?,?,?,?,?,?,?,?)')
      .run(randomUUID(), target.organization_id, null, 'operator.admin_recovery', 'success', 'user', target.user_id, '{"via":"local_cli"}')
    db.exec('COMMIT')
    return { ok: true, organizationSlug, username, sessionsRevoked: true }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
