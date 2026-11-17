-- Company stock quantities are explicitly operational, not valued accounting balances.
-- An inventory valuation/posting workflow must be added before declaring valued inventory support.
CREATE TABLE stock_items (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 sku TEXT NOT NULL CHECK(length(sku) BETWEEN 1 AND 64),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 unit TEXT NOT NULL CHECK(length(trim(unit)) BETWEEN 1 AND 24),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,sku), UNIQUE(organization_id,company_id,id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE stock_movements (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 item_id TEXT NOT NULL, happened_on TEXT NOT NULL CHECK(length(happened_on)=10 AND happened_on GLOB '????-??-??'),
 direction TEXT NOT NULL CHECK(direction IN ('in','out')),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,request_key),
 FOREIGN KEY(organization_id,company_id,item_id) REFERENCES stock_items(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX stock_movement_item ON stock_movements(organization_id,company_id,item_id,happened_on,id);
CREATE TRIGGER stock_move_immutable BEFORE UPDATE ON stock_movements BEGIN SELECT RAISE(ABORT,'Stock movements are append-only'); END;
CREATE TRIGGER stock_move_no_delete BEFORE DELETE ON stock_movements BEGIN SELECT RAISE(ABORT,'Stock movements are append-only'); END;
CREATE TRIGGER stock_item_no_delete BEFORE DELETE ON stock_items BEGIN SELECT RAISE(ABORT,'Stock items cannot be deleted'); END;
CREATE TRIGGER stock_item_ownership BEFORE UPDATE OF organization_id,company_id,sku ON stock_items
BEGIN SELECT RAISE(ABORT,'Stock item identity is immutable'); END;

CREATE TRIGGER stock_movement_status_guard BEFORE INSERT ON stock_movements
WHEN (SELECT status FROM stock_items WHERE id=NEW.item_id)<>'active'
 OR (SELECT max(happened_on) FROM stock_movements WHERE item_id=NEW.item_id)>NEW.happened_on
BEGIN SELECT RAISE(ABORT,'Stock item must be active and movements chronological'); END;
CREATE TRIGGER stock_movement_quantity_guard AFTER INSERT ON stock_movements
WHEN bigint_le('0',(SELECT bigint_total(CASE WHEN direction='in' THEN quantity_milli ELSE -quantity_milli END)
 FROM stock_movements WHERE item_id=NEW.item_id))=0
BEGIN SELECT RAISE(ABORT,'Negative stock is forbidden'); END;
CREATE TRIGGER stock_item_archive_guard BEFORE UPDATE OF status ON stock_items
WHEN NEW.status='archived' AND bigint_le('1',(SELECT bigint_total(CASE WHEN direction='in' THEN quantity_milli ELSE -quantity_milli END)
 FROM stock_movements WHERE item_id=OLD.id))=1
BEGIN SELECT RAISE(ABORT,'Cannot archive item with positive stock'); END;
