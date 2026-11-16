import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { rowAs } from '../../platform/database/rows.ts'
import { hashPassword, verifyPassword } from './passwords.ts'
import { code, passwordValue } from './validation.ts'
import { conflict, forbidden, unauthenticated } from './errors.ts'
import { sha256 } from './context.ts'
import { publicUser } from './presenters.ts'
import type { UserRow, LoginInput, AuthInput } from './types.ts'

export interface OrganizationRow { id: string; slug: string; name: string; status: string }
interface ThrottleRow { failures: number; window_started_at: string; locked_until: string | null }

const SESSION_MS = 12 * 60 * 60 * 1000
const LOCK_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
import type { IdentityContext } from './context.ts'

/** Scoped application use cases; no direct framework or HTTP dependency. */
export function createSessionService(ctx: IdentityContext) {
  const { db, now, future, audit, transaction, currentSession } = ctx
  // Used to make a missing user as costly to check as a wrong password.
  let dummyHash: string | undefined
  async function login({ organizationSlug, username, password }: LoginInput) {
    organizationSlug = code(organizationSlug, 'Organization slug')
    username = code(username, 'Username')
    if (typeof password !== 'string') throw unauthenticated()
    const org = rowAs<OrganizationRow>(db.prepare('SELECT id, status FROM organizations WHERE slug=?').get(organizationSlug))
    const user = org ? rowAs<UserRow>(db.prepare('SELECT * FROM users WHERE organization_id=? AND username=?').get(org.id, username)) : undefined
    dummyHash ??= await hashPassword('dummy-password-not-for-login')
    const valid = await verifyPassword(password, user?.password_hash ?? dummyHash)
    if (!org || org.status !== 'active') throw unauthenticated()
    const session = transaction(db, () => {
      const entry = rowAs<ThrottleRow>(db.prepare('SELECT failures,window_started_at,locked_until FROM login_throttles WHERE organization_id=? AND username=?').get(org.id, username))
      const nowIso = now()
      if (entry?.locked_until && entry.locked_until > nowIso) throw unauthenticated()
      const fresh = entry && new Date(nowIso).getTime() - new Date(entry.window_started_at).getTime() < LOCK_WINDOW_MS
      if (!valid || !user || user.status !== 'active') {
        const failures = (fresh ? entry.failures : 0) + 1
        const lockedUntil = failures >= MAX_FAILURES ? future(LOCK_WINDOW_MS) : null
        db.prepare(`INSERT INTO login_throttles(organization_id,username,failures,window_started_at,locked_until) VALUES(?,?,?,?,?)
          ON CONFLICT(organization_id,username) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until`)
          .run(org.id, username, failures, fresh ? entry.window_started_at : nowIso, lockedUntil)
        audit({ organizationId: org.id, action: 'session.login', outcome: 'failure', subjectType: 'session' })
        return null
      }
      // Password can change while scrypt runs; recheck its hash and active state in the write lock.
      const current = rowAs<Pick<UserRow, 'password_hash' | 'status' | 'auth_version'>>(db.prepare('SELECT password_hash,status,auth_version FROM users WHERE id=? AND organization_id=?').get(user.id, org.id))
      if (!current || current.status !== 'active' || current.password_hash !== user.password_hash) throw unauthenticated()
      db.prepare('DELETE FROM login_throttles WHERE organization_id=? AND username=?').run(org.id, username)
      const token = randomBytes(32).toString('base64url')
      const csrfToken = randomBytes(32).toString('base64url')
      const sessionId = randomUUID(), expiresAt = future(SESSION_MS)
      db.prepare('INSERT INTO sessions(id,token_hash,csrf_token,organization_id,user_id,auth_version,expires_at) VALUES(?,?,?,?,?,?,?)')
        .run(sessionId, sha256(token), csrfToken, org.id, user.id, current.auth_version, expiresAt)
      audit({ organizationId: org.id, actorId: user.id, action: 'session.login', subjectType: 'session', subjectId: sessionId })
      return { token, csrfToken, expiresAt, user: publicUser(user) }
    })
    if (!session) throw unauthenticated()
    return session
  }
  function verifyCsrf(sessionToken: string, csrfToken: string | null) {
    const actor = currentSession(sessionToken)
    if (typeof csrfToken !== 'string' || csrfToken.length !== actor.csrfToken.length || !timingSafeEqual(Buffer.from(csrfToken), Buffer.from(actor.csrfToken))) throw forbidden()
    return actor
  }
  function me(sessionToken: string) {
    const actor = currentSession(sessionToken)
    const org = rowAs<Pick<OrganizationRow, 'id' | 'slug' | 'name'>>(db.prepare('SELECT id,slug,name FROM organizations WHERE id=?').get(actor.organizationId))
    return { user: { id: actor.userId, username: actor.username, displayName: actor.displayName }, organization: org, csrfToken: actor.csrfToken }
  }
  function logout(sessionToken: string) {
    return transaction(db, () => {
      const actor = currentSession(sessionToken)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(), actor.sessionId)
      audit({ organizationId: actor.organizationId, actorId: actor.userId, action: 'session.logout', subjectType: 'session', subjectId: actor.sessionId })
      return { ok: true }
    })
  }
  async function changePassword({ sessionToken, oldPassword, newPassword }: AuthInput & { oldPassword: string; newPassword: string }) {
    passwordValue(newPassword)
    const actor = currentSession(sessionToken)
    const user = rowAs<Pick<UserRow, 'password_hash'>>(db.prepare('SELECT password_hash FROM users WHERE id=? AND organization_id=?').get(actor.userId, actor.organizationId))
    if (!user || !await verifyPassword(oldPassword, user.password_hash)) throw unauthenticated()
    const hashed = await hashPassword(newPassword)
    return transaction(db, () => {
      const verified = currentSession(sessionToken)
      const current = rowAs<Pick<UserRow, 'password_hash'>>(db.prepare('SELECT password_hash FROM users WHERE id=? AND organization_id=?').get(verified.userId, verified.organizationId))
      if (!current || current.password_hash !== user.password_hash) throw conflict('Password changed concurrently')
      db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=? AND organization_id=?').run(hashed, verified.userId, verified.organizationId)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE organization_id=? AND user_id=? AND revoked_at IS NULL').run(now(), verified.organizationId, verified.userId)
      audit({ organizationId: verified.organizationId, actorId: verified.userId, action: 'user.password_changed', subjectType: 'user', subjectId: verified.userId })
      return { ok: true, mustLoginAgain: true }
    })
  }
  return Object.freeze({ login, logout, me, verifyCsrf, changePassword })
}
