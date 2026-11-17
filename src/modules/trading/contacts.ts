import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { conflict, invalid, missing } from './errors.ts'
import { hash, key, text, uuid } from './validation.ts'
import type { TradeContext } from './context.ts'
import type { CompanyAction, ContactInput } from './types.ts'
interface ContactRow { id: string; code: string | null; display_name: string; status: 'active' | 'archived'; request_key: string | null; fingerprint: string | null; revision: number }
const publicContact = (r: ContactRow) => ({ id: r.id, code: r.code, displayName: r.display_name, status: r.status, revision: r.revision })
export function createContactService(ctx: TradeContext) {
  const { db, authorize, transaction, audit } = ctx
  function createContact(input: ContactInput) {
    const name = text(input.displayName, 'Contact name')
    const code = input.code === null || input.code === undefined ? null : key(input.code, 'Contact code')
    const requestKey = input.requestKey === undefined ? null : key(input.requestKey, 'requestKey')
    const fingerprint = requestKey === null ? null : hash({ name, code })
    return transaction(db, () => {
      const actor = authorize(input, 'contacts.manage')
      if (requestKey !== null) {
        const prior = rowAs<ContactRow>(db.prepare('SELECT * FROM contacts WHERE company_id=? AND request_key=?').get(actor.companyId, requestKey))
        if (prior) {
          if (prior.fingerprint !== fingerprint) return conflict('Contact request key reused with different contents')
          return { ...publicContact(prior), replayed: true }
        }
      }
      if (code !== null && db.prepare('SELECT 1 FROM contacts WHERE company_id=? AND code=?').get(actor.companyId, code)) return conflict('Contact code exists')
      const id = randomUUID()
      db.prepare('INSERT INTO contacts(id,company_id,code,display_name,request_key,fingerprint) VALUES(?,?,?,?,?,?)').run(id, actor.companyId, code, name, requestKey, fingerprint)
      audit(actor, input.companyId, 'contacts.create', 'contact', id)
      return { id, code, displayName: name, status: 'active' as const, revision: 1, replayed: false }
    })
  }
  function getContact(input: CompanyAction & { contactId: string }) {
    const actor = authorize(input, 'contacts.read')
    const row = rowAs<ContactRow>(db.prepare('SELECT * FROM contacts WHERE company_id=? AND id=?').get(actor.companyId, uuid(input.contactId, 'contactId')))
    return row ? publicContact(row) : missing()
  }
  function listContacts(input: CompanyAction) {
    const actor = authorize(input, 'contacts.read')
    return rowsAs<ContactRow>(db.prepare('SELECT * FROM contacts WHERE company_id=? ORDER BY display_name,id').all(actor.companyId)).map(publicContact)
  }
  function renameContact(input: CompanyAction & { contactId: string; displayName: string; expectedRevision: number }) {
    const name = text(input.displayName, 'Contact name')
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) return invalid('Invalid expectedRevision')
    return transaction(db, () => {
      const actor = authorize(input, 'contacts.manage')
      const row = rowAs<ContactRow>(db.prepare('SELECT * FROM contacts WHERE company_id=? AND id=?')
        .get(actor.companyId, uuid(input.contactId, 'contactId')))
      if (!row) return missing()
      if (row.revision !== input.expectedRevision) return conflict('Contact has been modified')
      db.prepare('UPDATE contacts SET display_name=?,revision=revision+1 WHERE company_id=? AND id=?')
        .run(name, actor.companyId, row.id)
      audit(actor, input.companyId, 'contacts.rename', 'contact', row.id)
      return { ...publicContact(row), displayName: name, revision: row.revision + 1 }
    })
  }
  function setContactStatus(input: CompanyAction & { contactId: string; status: 'active' | 'archived' }) {
    if (!['active','archived'].includes(input.status)) return conflict('Invalid contact status')
    return transaction(db, () => {
      const actor = authorize(input, 'contacts.manage')
      const current = rowAs<ContactRow>(db.prepare('SELECT * FROM contacts WHERE company_id=? AND id=?').get(actor.companyId, uuid(input.contactId, 'contactId')))
      if (!current) return missing()
      if (current.status === input.status) return publicContact(current)
      db.prepare('UPDATE contacts SET status=?,revision=revision+1 WHERE company_id=? AND id=?').run(input.status, actor.companyId, current.id)
      audit(actor, input.companyId, 'contacts.status', 'contact', current.id, { status: input.status })
      return { ...publicContact(current), status: input.status, revision: current.revision + 1 }
    })
  }
  return Object.freeze({ createContact, getContact, listContacts, renameContact, setContactStatus })
}
