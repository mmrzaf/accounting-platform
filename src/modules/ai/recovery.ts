import type { DatabaseSync } from 'node:sqlite'
import { transaction, type IdentityContext } from '../identity/context.ts'
import { rowsAs } from '../../platform/database/rows.ts'

/** A provider request is bounded to five rounds of 15 seconds by default.
 * Only expire a processing turn after a substantially longer grace period, so
 * a normal request cannot be mistaken for an abandoned one.
 */
const ABANDONED_TURN_MS = 3 * 60_000
const APPROVAL_EXPIRY_MS = 15 * 60_000
interface StaleTurn { id: string; conversation_id: string }
interface StaleAction { id: string; turn_id: string; conversation_id: string }

/** Reconcile interrupted model calls and expired approvals without replaying
 * any model-generated financial operation. Only rows belonging to the signed-in
 * user and company are eligible. This is safe to call on normal conversation
 * reads and retries; it never touches completed accounting records.
 */
export function recoverAiWork(input: {
  db: DatabaseSync
  identity: IdentityContext
  companyId: string
  userId: string
  clock: () => Date
}) {
  const { db, identity, companyId, userId, clock } = input
  const timestamp = clock().toISOString()
  const processingCutoff = new Date(clock().getTime() - ABANDONED_TURN_MS).toISOString()
  const approvalCutoff = new Date(clock().getTime() - APPROVAL_EXPIRY_MS).toISOString()
  return transaction(db, () => {
    const abandoned = rowsAs<StaleTurn>(db.prepare(`SELECT id,conversation_id FROM ai_turns
      WHERE company_id=? AND user_id=? AND status='processing' AND updated_at<?`)
      .all(companyId, userId, processingCutoff))
    for (const turn of abandoned) {
      db.prepare(`UPDATE ai_turns SET status='failed',reply=?,updated_at=?
        WHERE company_id=? AND user_id=? AND id=? AND status='processing'`)
        .run('The assistant was interrupted. No financial operation was executed. You may retry your request.',
          timestamp, companyId, userId, turn.id)
      identity.audit({ companyId, action: 'ai.turn.recover', subjectType: 'ai_turn', subjectId: turn.id,
        outcome: 'failure', details: { reason: 'provider_interrupted' } })
    }
    const expired = rowsAs<StaleAction>(db.prepare(`SELECT a.id,a.turn_id,t.conversation_id FROM ai_actions a
      JOIN ai_turns t ON t.id=a.turn_id AND t.company_id=a.company_id AND t.user_id=a.user_id
      WHERE a.company_id=? AND a.user_id=? AND a.state='awaiting_approval' AND a.created_at<?`)
      .all(companyId, userId, approvalCutoff))
    for (const action of expired) {
      db.prepare(`UPDATE ai_actions SET state='rejected',error_code='APPROVAL_EXPIRED',updated_at=?
        WHERE id=? AND company_id=? AND user_id=? AND state='awaiting_approval'`)
        .run(timestamp, action.id, companyId, userId)
      db.prepare(`UPDATE ai_turns SET status='completed',reply=?,updated_at=?
        WHERE id=? AND company_id=? AND user_id=? AND status='awaiting_approval'`)
        .run('The approval expired. No operation was executed; please request a new one.',
          timestamp, action.turn_id, companyId, userId)
      identity.audit({ companyId, action: 'ai.action.expire', subjectType: 'ai_action', subjectId: action.id,
        details: { reason: 'approval_expired' } })
    }
    return { interrupted: abandoned.length, expiredApprovals: expired.length }
  })
}
