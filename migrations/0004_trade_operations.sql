-- First trading workflows: contacts shared by organization, documents and settlement scoped to legal company.
-- Financial truth remains solely in journal_entries/journal_lines; amounts here are source-document face values.
INSERT INTO permission_definitions(code,scope,description) VALUES
 ('contacts.read','company','Read shared organization contacts from an authorized company'),
 ('contacts.manage','company','Manage shared organization contacts from an authorized company');
INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
 SELECT r.organization_id,r.id,'company',p.code FROM roles r
 JOIN permission_definitions p ON p.code IN ('contacts.read','contacts.manage')
 WHERE r.scope='company' AND r.system_role=1 AND
 ((p.code='contacts.read' AND r.code IN ('company-admin','company-accountant','company-reader','company-operator'))
 OR (p.code='contacts.manage' AND r.code IN ('company-admin','company-operator')));

CREATE TABLE contacts (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL,
 code TEXT, display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 160),
 request_key TEXT, fingerprint TEXT, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,id), UNIQUE(organization_id,code), UNIQUE(organization_id,request_key),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX contacts_lookup ON contacts(organization_id,status,display_name);
CREATE TRIGGER contacts_owner_locked BEFORE UPDATE OF organization_id,code,request_key,fingerprint ON contacts
 BEGIN SELECT RAISE(ABORT,'Contact identity and organization are immutable'); END;
CREATE TRIGGER contacts_no_delete BEFORE DELETE ON contacts
 BEGIN SELECT RAISE(ABORT,'Contacts must be archived rather than deleted'); END;

-- Gapless within a successfully committed sequence, company and document kind.
-- Internal numbers are NOT Iranian tax-authority serials or fiscal invoices.
CREATE TABLE trade_document_sequences (
 organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('sale','purchase','receipt','payment')),
 next_value INTEGER NOT NULL CHECK(next_value>=2),
 PRIMARY KEY(organization_id,company_id,kind),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE trade_invoices (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('sale','purchase')),
 party_id TEXT NOT NULL, issued_on TEXT NOT NULL,
 control_account_id TEXT NOT NULL,
 currency TEXT NOT NULL,
 total_minor INTEGER NOT NULL CHECK(total_minor>0),
 number TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed','voided')),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 journal_id TEXT, reversal_journal_id TEXT,
 description TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id), UNIQUE(organization_id,company_id,request_key),
 UNIQUE(organization_id,company_id,kind,number),
 UNIQUE(organization_id,company_id,journal_id), UNIQUE(organization_id,company_id,reversal_journal_id),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,party_id) REFERENCES contacts(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,control_account_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,currency) REFERENCES accounting_currencies(organization_id,company_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,reversal_journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX trade_invoices_by_party ON trade_invoices(organization_id,company_id,party_id,kind,status,issued_on);
CREATE TRIGGER trade_invoice_only_status_change BEFORE UPDATE ON trade_invoices
 WHEN OLD.status<>'draft' AND (NEW.organization_id<>OLD.organization_id OR NEW.company_id<>OLD.company_id
 OR NEW.kind<>OLD.kind OR NEW.party_id<>OLD.party_id OR NEW.issued_on<>OLD.issued_on
 OR NEW.control_account_id<>OLD.control_account_id OR NEW.currency<>OLD.currency
 OR NEW.total_minor<>OLD.total_minor OR NEW.request_key<>OLD.request_key
 OR NEW.fingerprint<>OLD.fingerprint OR NEW.number IS NOT OLD.number OR NEW.revision<>OLD.revision OR NEW.description<>OLD.description OR NEW.journal_id IS NOT OLD.journal_id
 OR (NEW.reversal_journal_id IS NOT OLD.reversal_journal_id AND NOT (OLD.status='posted' AND NEW.status='reversed')))
 BEGIN SELECT RAISE(ABORT,'Posted invoice fields are immutable'); END;
CREATE TRIGGER trade_invoice_post_guard BEFORE UPDATE OF status ON trade_invoices
 WHEN NEW.status='posted' AND OLD.status='draft' AND
 (NEW.number IS NULL OR NEW.journal_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM journal_entries j WHERE j.id=NEW.journal_id AND j.organization_id=NEW.organization_id AND j.company_id=NEW.company_id
    AND j.status='posted' AND j.source_type='trade.invoice' AND j.source_id=NEW.id AND j.source_event='post'
 ) OR (SELECT bigint_total(line_total_minor) FROM trade_invoice_lines WHERE invoice_id=OLD.id)<>CAST(OLD.total_minor AS TEXT))
 BEGIN SELECT RAISE(ABORT,'Invoice cannot post without matching balanced journal and lines'); END;
CREATE TRIGGER trade_invoice_transition_guard BEFORE UPDATE OF status ON trade_invoices
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('posted','voided'))
 OR (OLD.status='posted' AND NEW.status='reversed'))
 BEGIN SELECT RAISE(ABORT,'Invalid invoice lifecycle transition'); END;
CREATE TRIGGER trade_invoice_reversal_guard BEFORE UPDATE OF status ON trade_invoices
 WHEN NEW.status='reversed' AND (NEW.reversal_journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.reversal_journal_id AND j.organization_id=NEW.organization_id
 AND j.company_id=NEW.company_id AND j.reverses_id=OLD.journal_id AND j.status='posted'
 ) OR EXISTS (SELECT 1 FROM payment_allocations a WHERE a.invoice_id=OLD.id AND
 NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)))
 BEGIN SELECT RAISE(ABORT,'Cannot reverse invoice without valid reversal journal or while allocated'); END;
CREATE TRIGGER trade_invoice_no_delete BEFORE DELETE ON trade_invoices
 BEGIN SELECT RAISE(ABORT,'Invoices cannot be deleted'); END;

CREATE TABLE trade_invoice_lines (
 id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT NOT NULL,
 organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 line_no INTEGER NOT NULL CHECK(line_no>0),
 item_kind TEXT NOT NULL CHECK(item_kind IN ('service','non_stock','good')),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor>0),
 line_total_minor INTEGER NOT NULL CHECK(line_total_minor>0),
 account_id TEXT NOT NULL,
 UNIQUE(invoice_id,line_no),
 FOREIGN KEY(organization_id,company_id,invoice_id) REFERENCES trade_invoices(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,account_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER trade_invoice_lines_add_guard BEFORE INSERT ON trade_invoice_lines
 WHEN (SELECT status FROM trade_invoices WHERE id=NEW.invoice_id)<>'draft'
 BEGIN SELECT RAISE(ABORT,'Cannot add lines after invoice posting'); END;
CREATE TRIGGER trade_invoice_lines_no_update BEFORE UPDATE ON trade_invoice_lines
 BEGIN SELECT RAISE(ABORT,'Invoice line records are immutable'); END;
CREATE TRIGGER trade_invoice_lines_no_delete BEFORE DELETE ON trade_invoice_lines
 WHEN (SELECT status FROM trade_invoices WHERE id=OLD.invoice_id)<>'draft'
 BEGIN SELECT RAISE(ABORT,'Posted invoice line records are immutable'); END;

CREATE TABLE trade_payments (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('receipt','payment')),
 party_id TEXT NOT NULL, paid_on TEXT NOT NULL,
 control_account_id TEXT NOT NULL, bank_account_id TEXT NOT NULL,
 currency TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 number TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed','voided')),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 journal_id TEXT, reversal_journal_id TEXT,
 reference TEXT, description TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id), UNIQUE(organization_id,company_id,request_key),
 UNIQUE(organization_id,company_id,kind,number),
 UNIQUE(organization_id,company_id,journal_id), UNIQUE(organization_id,company_id,reversal_journal_id),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,party_id) REFERENCES contacts(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,control_account_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,bank_account_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,currency) REFERENCES accounting_currencies(organization_id,company_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,reversal_journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX trade_payments_by_party ON trade_payments(organization_id,company_id,party_id,kind,status,paid_on);
CREATE TRIGGER trade_payment_fields_locked BEFORE UPDATE ON trade_payments
 WHEN OLD.status<>'draft' AND (NEW.organization_id<>OLD.organization_id OR NEW.company_id<>OLD.company_id OR
 NEW.kind<>OLD.kind OR NEW.party_id<>OLD.party_id OR NEW.paid_on<>OLD.paid_on OR
 NEW.control_account_id<>OLD.control_account_id OR NEW.bank_account_id<>OLD.bank_account_id OR
 NEW.currency<>OLD.currency OR NEW.amount_minor<>OLD.amount_minor OR NEW.request_key<>OLD.request_key OR
 NEW.fingerprint<>OLD.fingerprint OR NEW.number IS NOT OLD.number OR NEW.reference IS NOT OLD.reference OR NEW.description<>OLD.description OR
 NEW.journal_id IS NOT OLD.journal_id
 OR (NEW.reversal_journal_id IS NOT OLD.reversal_journal_id AND NOT (OLD.status='posted' AND NEW.status='reversed')))
 BEGIN SELECT RAISE(ABORT,'Posted payment fields are immutable'); END;
CREATE TRIGGER trade_payment_post_guard BEFORE UPDATE OF status ON trade_payments
 WHEN NEW.status='posted' AND OLD.status='draft' AND (NEW.number IS NULL OR NEW.journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.journal_id AND j.organization_id=NEW.organization_id
 AND j.company_id=NEW.company_id AND j.status='posted' AND j.source_type='trade.payment'
 AND j.source_id=NEW.id AND j.source_event='post'))
 BEGIN SELECT RAISE(ABORT,'Payment cannot post without matching journal'); END;
CREATE TRIGGER trade_payment_transition_guard BEFORE UPDATE OF status ON trade_payments
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('posted','voided')) OR (OLD.status='posted' AND NEW.status='reversed'))
 BEGIN SELECT RAISE(ABORT,'Invalid payment lifecycle transition'); END;
CREATE TRIGGER trade_payment_reversal_guard BEFORE UPDATE OF status ON trade_payments
 WHEN NEW.status='reversed' AND (NEW.reversal_journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.reversal_journal_id AND j.organization_id=NEW.organization_id
 AND j.company_id=NEW.company_id AND j.reverses_id=OLD.journal_id AND j.status='posted') OR EXISTS (
 SELECT 1 FROM payment_allocations a WHERE a.payment_id=OLD.id AND
 NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)))
 BEGIN SELECT RAISE(ABORT,'Cannot reverse payment without valid reversal journal or while allocated'); END;
CREATE TRIGGER trade_payment_no_delete BEFORE DELETE ON trade_payments
 BEGIN SELECT RAISE(ABORT,'Payments cannot be deleted'); END;

CREATE TABLE payment_allocations (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id), UNIQUE(organization_id,company_id,request_key),
 FOREIGN KEY(organization_id,company_id,invoice_id) REFERENCES trade_invoices(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,payment_id) REFERENCES trade_payments(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX payment_allocations_invoice ON payment_allocations(organization_id,company_id,invoice_id);
CREATE INDEX payment_allocations_payment ON payment_allocations(organization_id,company_id,payment_id);
CREATE TRIGGER payment_allocation_source_guard BEFORE INSERT ON payment_allocations
 WHEN NOT EXISTS (SELECT 1 FROM trade_invoices i JOIN trade_payments p
 ON p.organization_id=i.organization_id AND p.company_id=i.company_id
 WHERE i.id=NEW.invoice_id AND p.id=NEW.payment_id AND i.organization_id=NEW.organization_id AND i.company_id=NEW.company_id
 AND i.status='posted' AND p.status='posted' AND i.party_id=p.party_id
 AND i.control_account_id=p.control_account_id AND i.currency=p.currency
 AND ((i.kind='sale' AND p.kind='receipt') OR (i.kind='purchase' AND p.kind='payment')))
 BEGIN SELECT RAISE(ABORT,'Invoice and payment must belong to the same party, type, currency and control account'); END;
CREATE TRIGGER payment_allocation_limit_guard AFTER INSERT ON payment_allocations
 WHEN bigint_le((SELECT bigint_total(a.amount_minor) FROM payment_allocations a WHERE a.invoice_id=NEW.invoice_id
 AND NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)),
 (SELECT total_minor FROM trade_invoices WHERE id=NEW.invoice_id))=0
 OR bigint_le((SELECT bigint_total(a.amount_minor) FROM payment_allocations a WHERE a.payment_id=NEW.payment_id
 AND NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)),
 (SELECT amount_minor FROM trade_payments WHERE id=NEW.payment_id))=0
 BEGIN SELECT RAISE(ABORT,'Overallocation is forbidden'); END;
CREATE TRIGGER payment_allocation_no_update BEFORE UPDATE ON payment_allocations
 BEGIN SELECT RAISE(ABORT,'Allocations are immutable'); END;
CREATE TRIGGER payment_allocation_no_delete BEFORE DELETE ON payment_allocations
 BEGIN SELECT RAISE(ABORT,'Allocations are immutable'); END;

CREATE TABLE allocation_reversals (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 allocation_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,allocation_id), UNIQUE(organization_id,company_id,request_key),
 FOREIGN KEY(organization_id,company_id,allocation_id) REFERENCES payment_allocations(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER allocation_reversal_no_update BEFORE UPDATE ON allocation_reversals
 BEGIN SELECT RAISE(ABORT,'Allocation reversals are immutable'); END;
CREATE TRIGGER allocation_reversal_no_delete BEFORE DELETE ON allocation_reversals
 BEGIN SELECT RAISE(ABORT,'Allocation reversals are immutable'); END;
