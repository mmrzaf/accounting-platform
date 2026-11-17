import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { createIdentityContext, transaction } from '../identity/context.ts'
import { dateOnly, key, text, uuid } from '../accounting/validation.ts'
import { MAX_SQLITE_INTEGER } from '../accounting/money.ts'
import { conflict, invalid, missing } from '../trading/errors.ts'
import { quantityMilli, hash } from '../trading/validation.ts'
import type { CompanyAction } from '../trading/types.ts'
interface Item { id: string; sku: string; name: string; unit: string; status: 'active' | 'archived' }
interface Movement { id: string; item_id: string; direction: 'in' | 'out'; happened_on: string; quantity_milli: string; note: string; fingerprint: string }
const show = (row: Item) => ({ id: row.id, sku: row.sku, name: row.name, unit: row.unit, status: row.status })
/** Quantity-only operational stock. There are intentionally NO inventory valuations or ledger entries here. */
export function createInventoryService(db: DatabaseSync, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  const identity = createIdentityContext(db, clock)
  function createItem(input: CompanyAction & { sku: string; name: string; unit: string }) {
    const sku = key(input.sku, 'SKU'), name = text(input.name, 'Item name'), unit = text(input.unit, 'Item unit', 24)
    return transaction(db, () => {
      const actor = identity.requireActor(input.sessionToken, 'inventory.manage', input.companyId)
      const prior = rowAs<Item>(db.prepare('SELECT id,sku,name,unit,status FROM stock_items WHERE company_id=? AND sku=?').get(actor.companyId, sku))
      if (prior) {
        if (prior.name !== name || prior.unit !== unit) return conflict('SKU already exists with different details')
        return { ...show(prior), replayed: true }
      }
      const id = randomUUID()
      db.prepare('INSERT INTO stock_items(id,company_id,sku,name,unit) VALUES(?,?,?,?,?)').run(id, input.companyId, sku, name, unit)
      identity.audit({ companyId: input.companyId, actorId: actor.userId, action: 'inventory.item.create', subjectType: 'stock_item', subjectId: id })
      return { id, sku, name, unit, status: 'active' as const, replayed: false }
    })
  }
  function load(actorCompanyId: string, companyId: string, itemId: string) {
    if (actorCompanyId !== companyId) return missing()
    return rowAs<Item>(db.prepare('SELECT id,sku,name,unit,status FROM stock_items WHERE company_id=? AND id=?')
      .get(actorCompanyId, uuid(itemId, 'itemId'))) ?? missing()
  }
  function balance(itemId: string) {
    const stmt = db.prepare(`SELECT bigint_total(CASE WHEN direction='in' THEN quantity_milli ELSE -quantity_milli END) AS qty FROM stock_movements WHERE item_id=?`)
    return BigInt(rowAs<{ qty: string }>(stmt.get(itemId))?.qty ?? '0')
  }
  function getItem(input: CompanyAction & { itemId: string }) {
    const actor = identity.requireActor(input.sessionToken, 'inventory.read', input.companyId)
    const row = load(actor.companyId, input.companyId, input.itemId)
    return { ...show(row), quantityMilli: balance(row.id).toString() }
  }
  function listItems(input: CompanyAction) {
    const actor = identity.requireActor(input.sessionToken, 'inventory.read', input.companyId)
    const rows = rowsAs<Item>(db.prepare('SELECT id,sku,name,unit,status FROM stock_items WHERE company_id=? ORDER BY sku LIMIT 1000')
      .all(actor.companyId))
    return rows.map(row => ({ ...show(row), quantityMilli: balance(row.id).toString() }))
  }
  function setItemStatus(input: CompanyAction & { itemId: string; status: 'active' | 'archived' }) {
    if (input.status !== 'active' && input.status !== 'archived') return invalid('Invalid item status')
    return transaction(db, () => {
      const actor = identity.requireActor(input.sessionToken, 'inventory.manage', input.companyId)
      const row = load(actor.companyId, input.companyId, input.itemId)
      if (row.status === input.status) return { ...show(row), changed: false }
      if (input.status === 'archived' && balance(row.id) !== 0n) return conflict('Cannot archive an item with remaining stock')
      db.prepare('UPDATE stock_items SET status=? WHERE id=?').run(input.status, row.id)
      identity.audit({ companyId: input.companyId, actorId: actor.userId, action: 'inventory.item.status', subjectType: 'stock_item', subjectId: row.id, details: { status: input.status } })
      return { ...show(row), status: input.status, changed: true }
    })
  }
  function move(input: CompanyAction & { itemId: string; direction: 'in' | 'out'; on: string; quantity: string; note: string; requestKey: string }) {
    const itemId = uuid(input.itemId, 'itemId'), direction = input.direction
    if (direction !== 'in' && direction !== 'out') return invalid('Direction must be in or out')
    const on = dateOnly(input.on), quantity = quantityMilli(input.quantity), note = text(input.note, 'Movement note', 500)
    const requestKey = key(input.requestKey, 'requestKey'), fingerprint = hash({ itemId, direction, on, quantity: quantity.toString(), note })
    return transaction(db, () => {
      const actor = identity.requireActor(input.sessionToken, 'inventory.manage', input.companyId)
      const old = rowAs<Movement>(db.prepare(`SELECT id,item_id,direction,happened_on,CAST(quantity_milli AS TEXT) AS quantity_milli,note,fingerprint
        FROM stock_movements WHERE company_id=? AND request_key=?`).get(actor.companyId, requestKey))
      if (old) {
        if (old.fingerprint !== fingerprint) return conflict('Stock request key reused with different details')
        return { id: old.id, itemId: old.item_id, direction: old.direction, quantityMilli: old.quantity_milli, on: old.happened_on, replayed: true }
      }
      const item = load(actor.companyId, input.companyId, itemId)
      if (item.status !== 'active') return invalid('Cannot move stock for an archived item')
      const latest = rowAs<{ latest: string | null }>(db.prepare('SELECT max(happened_on) AS latest FROM stock_movements WHERE item_id=?').get(itemId))?.latest
      if (latest && on < latest) return conflict('Backdated stock movements are not permitted; use a correcting movement')
      const current = balance(itemId)
      if (direction === 'out' && current < quantity) return conflict('Insufficient stock')
      if (direction === 'in' && current + quantity > MAX_SQLITE_INTEGER) return invalid('Stock quantity exceeds storage range')
      const id = randomUUID()
      db.prepare(`INSERT INTO stock_movements(id,company_id,item_id,happened_on,direction,quantity_milli,request_key,fingerprint,note) VALUES(?,?,?,?,?,?,?,?,?)`).run(id, input.companyId, itemId, on, direction, quantity, requestKey, fingerprint, note)
      identity.audit({ companyId: input.companyId, actorId: actor.userId, action: 'inventory.move', subjectType: 'stock_movement', subjectId: id, details: { direction, on } })
      return { id, itemId, direction, quantityMilli: quantity.toString(), on, replayed: false }
    })
  }
  function listMovements(input: CompanyAction & { itemId: string }) {
    const actor = identity.requireActor(input.sessionToken, 'inventory.read', input.companyId)
    const item = load(actor.companyId, input.companyId, input.itemId)
    return rowsAs<Movement>(db.prepare(`SELECT id,item_id,direction,happened_on,CAST(quantity_milli AS TEXT) AS quantity_milli,note,fingerprint
      FROM stock_movements WHERE company_id=? AND item_id=? ORDER BY happened_on,id LIMIT 1000`)
      .all(actor.companyId, item.id)).map(m => ({ id: m.id, direction: m.direction, on: m.happened_on, quantityMilli: m.quantity_milli, note: m.note }))
  }
  return Object.freeze({ createItem, getItem, listItems, setItemStatus, move, listMovements })
}
