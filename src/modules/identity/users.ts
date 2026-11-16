import { randomUUID } from 'node:crypto'
import { rowsAs } from '../../platform/database/rows.ts'
import { hashPassword } from './passwords.ts'
import { code, requiredString, passwordValue, requestedStatus } from './validation.ts'
import { conflict } from './errors.ts'
import { publicUser } from './presenters.ts'
import type { UserRow, AuthInput, UserIdInput } from './types.ts'
import type { IdentityContext } from './context.ts'

/** Scoped application use cases; no direct framework or HTTP dependency. */
export function createUserService(ctx: IdentityContext) {
  const { db, now, audit, transaction, requireActor, getUserInOrg, guardLastAdmin } = ctx
  async function createUser({ sessionToken, username, displayName, password }: AuthInput & { username: string; displayName: string; password: string }) {
    username = code(username, 'Username')
    displayName = requiredString(displayName, 'Display name')
    const actor = requireActor(sessionToken, 'users.manage')
    const hashed = await hashPassword(password)
    return transaction(db, () => {
      requireActor(sessionToken, 'users.manage')
      if (db.prepare('SELECT 1 FROM users WHERE organization_id=? AND username=?').get(actor.organizationId, username)) throw conflict('Username already exists')
      const id = randomUUID()
      db.prepare('INSERT INTO users(id,organization_id,username,display_name,password_hash) VALUES(?,?,?,?,?)').run(id, actor.organizationId, username, displayName, hashed)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, action: 'user.create', subjectType: 'user', subjectId: id })
      return { id, organizationId: actor.organizationId, username, displayName, status: 'active' }
    })
  }
  function listUsers({ sessionToken }: AuthInput) {
    const actor = requireActor(sessionToken, 'users.read')
    return rowsAs<UserRow>(db.prepare('SELECT id,organization_id,username,display_name,status FROM users WHERE organization_id=? ORDER BY username').all(actor.organizationId)).map(publicUser)
  }
  function setUserStatus({ sessionToken, userId, status }: UserIdInput & { status: 'active' | 'disabled' }) {
    status = requestedStatus(status)
    return transaction(db, () => {
      const actor = requireActor(sessionToken, 'users.manage')
      const target = getUserInOrg(actor, userId)
      if (status === 'disabled' && actor.userId === userId) throw conflict('Cannot disable your own account')
      if (status === 'disabled' && target.status === 'active') guardLastAdmin(actor.organizationId, userId)
      if (target.status === status) return publicUser(target)
      db.prepare('UPDATE users SET status=?,auth_version=auth_version+1 WHERE organization_id=? AND id=?').run(status, actor.organizationId, userId)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE organization_id=? AND user_id=? AND revoked_at IS NULL').run(now(), actor.organizationId, userId)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, action: `user.${status}`, subjectType: 'user', subjectId: userId })
      return { ...publicUser(target), status }
    })
  }
  async function resetUserPassword({ sessionToken, userId, newPassword }: UserIdInput & { newPassword: string }) {
    passwordValue(newPassword)
    const actor = requireActor(sessionToken, 'users.manage')
    getUserInOrg(actor, userId)
    const hashed = await hashPassword(newPassword)
    return transaction(db, () => {
      requireActor(sessionToken, 'users.manage')
      getUserInOrg(actor, userId)
      db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE organization_id=? AND id=?')
        .run(hashed, actor.organizationId, userId)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE organization_id=? AND user_id=? AND revoked_at IS NULL')
        .run(now(), actor.organizationId, userId)
      db.prepare('DELETE FROM login_throttles WHERE organization_id=? AND username=(SELECT username FROM users WHERE id=? AND organization_id=?)')
        .run(actor.organizationId, userId, actor.organizationId)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, action: 'user.password_reset', subjectType: 'user', subjectId: userId })
      return { ok: true, sessionsRevoked: true }
    })
  }
  function unlockUser({ sessionToken, userId }: UserIdInput) {
    return transaction(db, () => {
      const actor = requireActor(sessionToken, 'users.manage')
      const target = getUserInOrg(actor, userId)
      db.prepare('DELETE FROM login_throttles WHERE organization_id=? AND username=?').run(actor.organizationId, target.username)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, action: 'user.unlock', subjectType: 'user', subjectId: userId })
      return { ok: true }
    })
  }
  return Object.freeze({ createUser, listUsers, setUserStatus, resetUserPassword, unlockUser })
}
