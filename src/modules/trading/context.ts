import type { DatabaseSync } from 'node:sqlite'
import { createIdentityContext } from '../identity/context.ts'
import { accountingContext } from '../accounting/context.ts'
import { createPostingService } from '../accounting/posting.ts'
import { createAccountingReferenceReader } from '../accounting/references.ts'
import { rowAs } from '../../platform/database/rows.ts'
import type { Actor } from '../identity/types.ts'
import type { Permission } from '../identity/permissions.ts'
import { invalid, missing } from './errors.ts'
import { uuid } from './validation.ts'
import type { CompanyAction } from './types.ts'
export function tradeContext(db: DatabaseSync, clock: () => Date) {
  const identity = createIdentityContext(db, clock)
  const accounting = createPostingService(accountingContext(db, clock))
  const references = createAccountingReferenceReader(db)
  function authorize(input: CompanyAction, permission: Permission): Actor {
    uuid(input.companyId, 'companyId')
    return identity.requireActor(input.sessionToken, permission, input.companyId)
  }
  function party(actor: Actor, partyId: string) {
    const row = rowAs<{ id: string; display_name: string; status: string }>(db.prepare('SELECT id,display_name,status FROM contacts WHERE organization_id=? AND id=?')
      .get(actor.organizationId, uuid(partyId, 'partyId')))
    if (!row) return missing()
    if (row.status !== 'active') return invalid('Contact is archived')
    return row
  }
  function audit(actor: Actor, companyId: string, action: string, subjectType: string, subjectId: string, details: Record<string,string | number | boolean | null> = {}) {
    identity.audit({ organizationId: actor.organizationId, companyId, actorId: actor.userId, action, subjectType, subjectId, details })
  }
  return { db, accounting, authorize, book: references.book, account: references.account, party, audit, transaction: identity.transaction }
}
export type TradeContext = ReturnType<typeof tradeContext>
