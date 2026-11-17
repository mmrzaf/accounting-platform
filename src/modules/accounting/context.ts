import type { DatabaseSync } from 'node:sqlite'
import { createIdentityContext } from '../identity/context.ts'
import type { Actor } from '../identity/types.ts'
import { rowAs } from '../../platform/database/rows.ts'
import { missing } from './errors.ts'
import { uuid } from './validation.ts'
import type { ScopedAction } from './types.ts'
export interface BookRow {
  company_id: string
  base_currency: string
  timezone: string
}
export interface AccountRow {
  id: string
  code: string
  name: string
  category: string
  postable: number
  active: number
  parent_id: string | null
}
export interface PeriodRow {
  id: string
  code: string
  starts_on: string
  ends_on: string
  status: 'open' | 'closed'
}
/** All business operations start with a current session and explicit company-scoped role. */
export function accountingContext(db: DatabaseSync, clock: () => Date) {
  const identity = createIdentityContext(db, clock)
  const actorFor = (input: ScopedAction, permission: 'accounting.read' | 'accounting.post' | 'accounting.configure' | 'accounting.reverse' | 'accounting.close'): Actor => {
    uuid(input.companyId, 'companyId')
    return identity.requireActor(input.sessionToken, permission, input.companyId)
  }
  const bookFor = (actor: Actor, companyId: string): BookRow => {
    if (actor.companyId !== companyId) return missing()
    const book = rowAs<BookRow>(db.prepare('SELECT company_id,base_currency,timezone FROM accounting_books WHERE company_id=?').get(actor.companyId))
    if (!book)
      return missing()
    return book
  }
  const audit = (actor: Actor, companyId: string, action: string, subjectType: string, subjectId: string, details: Record<string, string | number | boolean | null> = {}) => identity.audit({ companyId, actorId: actor.userId, action, subjectType, subjectId, details })
  return { db, actorFor, bookFor, audit, transaction: identity.transaction, now: identity.now }
}
export type AccountingContext = ReturnType<typeof accountingContext>
