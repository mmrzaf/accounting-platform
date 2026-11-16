import type { DatabaseSync } from 'node:sqlite'
import { rowAs } from '../../platform/database/rows.ts'
import type { Actor } from '../identity/types.ts'
import type { InvoiceKind, PaymentKind } from './types.ts'
/** Allocates a company/kind-scoped internal number. Must be called inside the posting transaction. */
export function nextDocumentNumber(db: DatabaseSync, actor: Actor, companyId: string, kind: InvoiceKind | PaymentKind): string {
  if (!db.isTransaction) throw new Error('Document numbering requires an active transaction')
  const stmt = db.prepare(`INSERT INTO trade_document_sequences(organization_id,company_id,kind,next_value) VALUES(?,?,?,2)
    ON CONFLICT(organization_id,company_id,kind) DO UPDATE SET next_value=next_value+1 RETURNING next_value`)
  stmt.setReadBigInts(true)
  const row = rowAs<{ next_value: bigint }>(stmt.get(actor.organizationId, companyId, kind))
  if (!row) throw new Error('Document number allocation failed')
  const prefix = { sale: 'S', purchase: 'P', receipt: 'R', payment: 'D' }[kind]
  return `${prefix}-${(row.next_value - 1n).toString().padStart(6,'0')}`
}
