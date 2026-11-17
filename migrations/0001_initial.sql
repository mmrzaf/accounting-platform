-- Initial company-scoped schema. New installations only; no production data exists.
-- New schema changes after first release require forward-only migrations.

-- 0001 installation
-- Initial schema for the single-company application.
CREATE TABLE installation_settings (
  key TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 0002 identity_access
-- Single legal company is the sole isolation boundary. A user belongs to one company for life.
-- Login names are unique throughout the installation, so no company selection is necessary.
CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(username) BETWEEN 2 AND 64),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id,id)
) STRICT;
CREATE INDEX users_by_company ON users(company_id,status);
CREATE TRIGGER user_company_immutable BEFORE UPDATE OF company_id ON users
  BEGIN SELECT RAISE(ABORT,'User company cannot change'); END;
CREATE TABLE permission_definitions (
  code TEXT PRIMARY KEY NOT NULL,
  description TEXT NOT NULL
) STRICT;
INSERT INTO permission_definitions(code,description) VALUES
 ('company.read','View company profile'), ('company.manage','Update company settings'),
 ('users.read','View company users'), ('users.manage','Manage company users'),
 ('roles.manage','Define and assign roles'), ('audit.read','Review company security audit'),
 ('accounting.read','Read accounting records'),('accounting.post','Post journals'),
 ('sales.read','Read sales documents'),('sales.manage','Manage sales documents'),
 ('purchasing.read','Read purchase documents'),('purchasing.manage','Manage purchase documents'),
 ('payments.read','Read payments'),('payments.manage','Manage payments');
CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  system_role INTEGER NOT NULL DEFAULT 0 CHECK (system_role IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id,id), UNIQUE (company_id,code)
) STRICT;
CREATE TABLE role_permissions (
  company_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY(company_id,role_id,permission_code),
  FOREIGN KEY(company_id,role_id) REFERENCES roles(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(permission_code) REFERENCES permission_definitions(code) ON DELETE RESTRICT
) STRICT;
CREATE TABLE user_role_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id,user_id,role_id),
  FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,role_id) REFERENCES roles(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX grants_by_user ON user_role_assignments(company_id,user_id);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  auth_version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX sessions_by_user ON sessions(company_id,user_id,expires_at);
CREATE TABLE login_throttles (
  username TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures>=0),
  window_started_at TEXT NOT NULL,
  locked_until TEXT
) STRICT;
CREATE TABLE security_audit (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure')),
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(company_id,actor_user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX audit_by_company ON security_audit(company_id,created_at DESC,id DESC);
CREATE TRIGGER security_audit_no_update BEFORE UPDATE ON security_audit BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
CREATE TRIGGER security_audit_no_delete BEFORE DELETE ON security_audit BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
CREATE TRIGGER roles_company_immutable BEFORE UPDATE OF company_id ON roles
 BEGIN SELECT RAISE(ABORT,'Cannot move role to another company'); END;

-- 0003 accounting_ledger
-- Per-legal-company accounting: exact integer minor units, company-scoped references.
-- Staging headers are created, populated and posted within a single writer transaction.
INSERT INTO permission_definitions(code,description) VALUES
 ('accounting.configure','Configure accounting books, currencies and accounts'),
 ('accounting.reverse','Reverse posted financial entries'),
 ('accounting.close','Close or reopen fiscal periods');
INSERT INTO role_permissions(company_id,role_id,permission_code)
 SELECT r.company_id,r.id,p.code FROM roles r
 JOIN permission_definitions p ON p.code IN ('accounting.configure','accounting.reverse','accounting.close')
 WHERE r.system_role=1 AND r.code IN ('company-admin','company-accountant');

CREATE TABLE accounting_books (
 company_id TEXT NOT NULL,
 base_currency TEXT NOT NULL CHECK(length(base_currency)=3),
 timezone TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(company_id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE accounting_currencies (
 company_id TEXT NOT NULL, code TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 decimals INTEGER NOT NULL CHECK(decimals BETWEEN 0 AND 6),
 PRIMARY KEY(company_id,code),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 CHECK (length(code)=3 AND code GLOB '[A-Z][A-Z][A-Z]')
) STRICT;
CREATE TRIGGER accounting_books_base_locked BEFORE UPDATE OF base_currency ON accounting_books
 BEGIN SELECT RAISE(ABORT,'Base currency is immutable; establish a new book for changes'); END;
CREATE TRIGGER accounting_currency_precision_locked BEFORE UPDATE OF decimals,code ON accounting_currencies
 BEGIN SELECT RAISE(ABORT,'Currency precision is immutable'); END;

CREATE TABLE fiscal_periods (
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
 code TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id), UNIQUE(company_id,code),
 CHECK (starts_on <= ends_on),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX fiscal_period_dates ON fiscal_periods(company_id,starts_on,ends_on);
CREATE TRIGGER fiscal_period_no_overlap_insert BEFORE INSERT ON fiscal_periods
 WHEN EXISTS(SELECT 1 FROM fiscal_periods p WHERE p.company_id=NEW.company_id AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on)
 BEGIN SELECT RAISE(ABORT,'Overlapping fiscal periods'); END;
CREATE TRIGGER fiscal_period_dates_immutable BEFORE UPDATE OF starts_on,ends_on,company_id ON fiscal_periods
 BEGIN SELECT RAISE(ABORT,'Fiscal period dates and ownership are immutable'); END;

CREATE TABLE ledger_accounts (
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
 code TEXT NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 category TEXT NOT NULL CHECK(category IN ('asset','liability','equity','revenue','expense')),
 parent_id TEXT, postable INTEGER NOT NULL DEFAULT 1 CHECK(postable IN (0,1)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,parent_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 CHECK(parent_id IS NULL OR parent_id<>id)
) STRICT;
CREATE INDEX ledger_accounts_directory ON ledger_accounts(company_id,category,code);
CREATE TRIGGER ledger_accounts_ownership_immutable BEFORE UPDATE OF company_id,category,parent_id,code,postable ON ledger_accounts
 BEGIN SELECT RAISE(ABORT,'Account structure is immutable'); END;
CREATE TRIGGER ledger_accounts_parent_guard BEFORE INSERT ON ledger_accounts
 WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ledger_accounts p WHERE p.id=NEW.parent_id AND p.company_id=NEW.company_id AND p.category=NEW.category AND p.postable=0 AND p.active=1
 ) BEGIN SELECT RAISE(ABORT,'Invalid parent account'); END;

CREATE TABLE journal_entries (
 entry_number INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE, company_id TEXT NOT NULL,
 period_id TEXT NOT NULL, posted_on TEXT NOT NULL,
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_event TEXT NOT NULL,
 idempotency_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'staging' CHECK(status IN ('staging','posted')),
 reverses_id TEXT,
 base_currency TEXT NOT NULL,
 posted_by TEXT NOT NULL,
 posted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id),
 UNIQUE(company_id,source_type,source_id,source_event),
 UNIQUE(company_id,idempotency_key),
 UNIQUE(company_id,reverses_id),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,period_id) REFERENCES fiscal_periods(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reverses_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,posted_by) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX journal_entries_by_date ON journal_entries(company_id,posted_on,id);
-- A caller cannot skip the staging -> posted transition by inserting a posted header.
CREATE TRIGGER journal_entries_insert_guard BEFORE INSERT ON journal_entries
 WHEN NEW.status<>'staging'
 BEGIN SELECT RAISE(ABORT,'Journal must begin in staging'); END;
CREATE TRIGGER journal_entries_no_delete BEFORE DELETE ON journal_entries
 BEGIN SELECT RAISE(ABORT,'Journal entries cannot be deleted'); END;
CREATE TRIGGER journal_entries_no_update_posted BEFORE UPDATE ON journal_entries
 WHEN OLD.status='posted' OR NEW.status<>'posted' OR OLD.status<>'staging'
 BEGIN SELECT RAISE(ABORT,'Posted journals are immutable'); END;
CREATE TRIGGER journal_entries_posting_integrity BEFORE UPDATE OF status ON journal_entries
 WHEN OLD.status='staging' AND NEW.status='posted'
 BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM fiscal_periods p JOIN accounting_books b
      ON b.company_id=p.company_id
    WHERE p.id=NEW.period_id AND p.company_id=NEW.company_id
      AND p.status='open' AND p.starts_on<=NEW.posted_on AND p.ends_on>=NEW.posted_on
      AND b.base_currency=NEW.base_currency
   ) THEN RAISE(ABORT,'Posting requires an open matching fiscal period and base currency') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM journal_lines l JOIN ledger_accounts a
      ON a.id=l.account_id AND a.company_id=l.company_id
    WHERE l.journal_id=NEW.id AND (a.active<>1 OR a.postable<>1)
   ) THEN RAISE(ABORT,'Posted lines require active postable accounts') END;
  SELECT CASE WHEN (SELECT count(*) FROM journal_lines WHERE journal_id=NEW.id)<2
   THEN RAISE(ABORT,'A posted journal requires at least two lines') END;
  SELECT CASE WHEN (SELECT bigint_total(debit_minor) FROM journal_lines WHERE journal_id=NEW.id)
   <> (SELECT bigint_total(credit_minor) FROM journal_lines WHERE journal_id=NEW.id)
   THEN RAISE(ABORT,'Unbalanced journal') END;
 END;

CREATE TABLE journal_lines (
 id TEXT PRIMARY KEY NOT NULL, journal_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 line_no INTEGER NOT NULL CHECK(line_no>=1),
 account_id TEXT NOT NULL,
 debit_minor INTEGER NOT NULL DEFAULT 0 CHECK(debit_minor>=0),
 credit_minor INTEGER NOT NULL DEFAULT 0 CHECK(credit_minor>=0),
 currency TEXT NOT NULL, transaction_minor INTEGER NOT NULL CHECK(transaction_minor>0),
 rate_numerator TEXT, rate_denominator TEXT, rate_date TEXT, rate_source TEXT,
 memo TEXT,
 UNIQUE(journal_id,line_no),
 CHECK ((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0)),
 CHECK ((rate_numerator IS NULL AND rate_denominator IS NULL AND rate_date IS NULL AND rate_source IS NULL) OR
        (rate_numerator IS NOT NULL AND rate_denominator IS NOT NULL AND rate_date IS NOT NULL AND rate_source IS NOT NULL)),
 FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,account_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,currency) REFERENCES accounting_currencies(company_id,code) ON DELETE RESTRICT
) STRICT;
CREATE INDEX journal_lines_by_account ON journal_lines(company_id,account_id,journal_id);
CREATE TRIGGER journal_lines_no_update BEFORE UPDATE ON journal_lines
 BEGIN SELECT RAISE(ABORT,'Journal lines are immutable'); END;
CREATE TRIGGER journal_lines_no_delete BEFORE DELETE ON journal_lines
 BEGIN SELECT RAISE(ABORT,'Journal lines cannot be deleted'); END;
CREATE TRIGGER journal_lines_only_staging BEFORE INSERT ON journal_lines
 WHEN (SELECT status FROM journal_entries WHERE id=NEW.journal_id)<>'staging'
 BEGIN SELECT RAISE(ABORT,'Cannot add lines to a posted journal'); END;
CREATE TRIGGER journal_lines_currency_guard BEFORE INSERT ON journal_lines
 WHEN NOT EXISTS (
   SELECT 1 FROM journal_entries j
   WHERE j.id=NEW.journal_id AND j.company_id=NEW.company_id
     AND ((NEW.currency=j.base_currency AND NEW.rate_numerator IS NULL)
       OR (NEW.currency<>j.base_currency AND NEW.rate_numerator IS NOT NULL))
 ) BEGIN SELECT RAISE(ABORT,'Invalid journal currency or FX snapshot'); END;

-- Auditable status transition and source provenance, without independent balances.
CREATE TRIGGER fiscal_period_close_guard BEFORE UPDATE OF status ON fiscal_periods
 WHEN NEW.status='closed' AND OLD.status='open' AND EXISTS(
  SELECT 1 FROM journal_entries j WHERE j.period_id=OLD.id AND j.status='staging'
 ) BEGIN SELECT RAISE(ABORT,'Unposted journals in period'); END;

-- 0004 trade_operations
-- First trading workflows: contacts and financial documents are scoped to their company.
-- Financial truth remains solely in journal_entries/journal_lines; amounts here are source-document face values.
INSERT INTO permission_definitions(code,description) VALUES
 ('contacts.read','Read company contacts'),
 ('contacts.manage','Manage company contacts');
INSERT INTO role_permissions(company_id,role_id,permission_code)
 SELECT r.company_id,r.id,p.code FROM roles r
 JOIN permission_definitions p ON p.code IN ('contacts.read','contacts.manage')
 WHERE r.system_role=1 AND
 ((p.code='contacts.read' AND r.code IN ('company-admin','company-accountant','company-reader','company-operator'))
 OR (p.code='contacts.manage' AND r.code IN ('company-admin','company-operator')));

CREATE TABLE contacts (
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
 code TEXT, display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 160),
 request_key TEXT, fingerprint TEXT, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id), UNIQUE(company_id,code), UNIQUE(company_id,request_key),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX contacts_lookup ON contacts(company_id,status,display_name);
CREATE TRIGGER contacts_owner_locked BEFORE UPDATE OF company_id,code,request_key,fingerprint ON contacts
 BEGIN SELECT RAISE(ABORT,'Contact identity and company are immutable'); END;
CREATE TRIGGER contacts_no_delete BEFORE DELETE ON contacts
 BEGIN SELECT RAISE(ABORT,'Contacts must be archived rather than deleted'); END;

-- Gapless within a successfully committed sequence, company and document kind.
-- Internal numbers are NOT Iranian tax-authority serials or fiscal invoices.
CREATE TABLE trade_document_sequences (
 company_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('sale','purchase','receipt','payment')),
 next_value INTEGER NOT NULL CHECK(next_value>=2),
 PRIMARY KEY(company_id,kind),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE trade_invoices (
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
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
 UNIQUE(company_id,id), UNIQUE(company_id,request_key),
 UNIQUE(company_id,kind,number),
 UNIQUE(company_id,journal_id), UNIQUE(company_id,reversal_journal_id),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,party_id) REFERENCES contacts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,control_account_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,currency) REFERENCES accounting_currencies(company_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reversal_journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX trade_invoices_by_party ON trade_invoices(company_id,party_id,kind,status,issued_on);
CREATE TRIGGER trade_invoice_only_status_change BEFORE UPDATE ON trade_invoices
 WHEN OLD.status<>'draft' AND (NEW.company_id<>OLD.company_id
 OR NEW.kind<>OLD.kind OR NEW.party_id<>OLD.party_id OR NEW.issued_on<>OLD.issued_on
 OR NEW.control_account_id<>OLD.control_account_id OR NEW.currency<>OLD.currency
 OR NEW.total_minor<>OLD.total_minor OR NEW.request_key<>OLD.request_key
 OR NEW.fingerprint<>OLD.fingerprint OR NEW.number IS NOT OLD.number OR NEW.revision<>OLD.revision OR NEW.description<>OLD.description OR NEW.journal_id IS NOT OLD.journal_id
 OR (NEW.reversal_journal_id IS NOT OLD.reversal_journal_id AND NOT (OLD.status='posted' AND NEW.status='reversed')))
 BEGIN SELECT RAISE(ABORT,'Posted invoice fields are immutable'); END;
CREATE TRIGGER trade_invoice_post_guard BEFORE UPDATE OF status ON trade_invoices
 WHEN NEW.status='posted' AND OLD.status='draft' AND
 (NEW.number IS NULL OR NEW.journal_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM journal_entries j WHERE j.id=NEW.journal_id AND j.company_id=NEW.company_id
    AND j.status='posted' AND j.source_type='trade.invoice' AND j.source_id=NEW.id AND j.source_event='post'
 ) OR (SELECT bigint_total(line_total_minor) FROM trade_invoice_lines WHERE invoice_id=OLD.id)<>CAST(OLD.total_minor AS TEXT))
 BEGIN SELECT RAISE(ABORT,'Invoice cannot post without matching balanced journal and lines'); END;
CREATE TRIGGER trade_invoice_transition_guard BEFORE UPDATE OF status ON trade_invoices
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('posted','voided'))
 OR (OLD.status='posted' AND NEW.status='reversed'))
 BEGIN SELECT RAISE(ABORT,'Invalid invoice lifecycle transition'); END;
CREATE TRIGGER trade_invoice_reversal_guard BEFORE UPDATE OF status ON trade_invoices
 WHEN NEW.status='reversed' AND (NEW.reversal_journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.reversal_journal_id AND j.company_id=NEW.company_id AND j.reverses_id=OLD.journal_id AND j.status='posted'
 ) OR EXISTS (SELECT 1 FROM payment_allocations a WHERE a.invoice_id=OLD.id AND
 NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)))
 BEGIN SELECT RAISE(ABORT,'Cannot reverse invoice without valid reversal journal or while allocated'); END;
CREATE TRIGGER trade_invoice_no_delete BEFORE DELETE ON trade_invoices
 BEGIN SELECT RAISE(ABORT,'Invoices cannot be deleted'); END;

CREATE TABLE trade_invoice_lines (
 id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 line_no INTEGER NOT NULL CHECK(line_no>0),
 item_kind TEXT NOT NULL CHECK(item_kind IN ('service','non_stock','good')),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor>0),
 line_total_minor INTEGER NOT NULL CHECK(line_total_minor>0),
 account_id TEXT NOT NULL,
 UNIQUE(invoice_id,line_no),
 FOREIGN KEY(company_id,invoice_id) REFERENCES trade_invoices(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,account_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT
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
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
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
 UNIQUE(company_id,id), UNIQUE(company_id,request_key),
 UNIQUE(company_id,kind,number),
 UNIQUE(company_id,journal_id), UNIQUE(company_id,reversal_journal_id),
 FOREIGN KEY(company_id) REFERENCES accounting_books(company_id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,party_id) REFERENCES contacts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,control_account_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,bank_account_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,currency) REFERENCES accounting_currencies(company_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reversal_journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX trade_payments_by_party ON trade_payments(company_id,party_id,kind,status,paid_on);
CREATE TRIGGER trade_payment_fields_locked BEFORE UPDATE ON trade_payments
 WHEN OLD.status<>'draft' AND (NEW.company_id<>OLD.company_id OR
 NEW.kind<>OLD.kind OR NEW.party_id<>OLD.party_id OR NEW.paid_on<>OLD.paid_on OR
 NEW.control_account_id<>OLD.control_account_id OR NEW.bank_account_id<>OLD.bank_account_id OR
 NEW.currency<>OLD.currency OR NEW.amount_minor<>OLD.amount_minor OR NEW.request_key<>OLD.request_key OR
 NEW.fingerprint<>OLD.fingerprint OR NEW.number IS NOT OLD.number OR NEW.reference IS NOT OLD.reference OR NEW.description<>OLD.description OR
 NEW.journal_id IS NOT OLD.journal_id
 OR (NEW.reversal_journal_id IS NOT OLD.reversal_journal_id AND NOT (OLD.status='posted' AND NEW.status='reversed')))
 BEGIN SELECT RAISE(ABORT,'Posted payment fields are immutable'); END;
CREATE TRIGGER trade_payment_post_guard BEFORE UPDATE OF status ON trade_payments
 WHEN NEW.status='posted' AND OLD.status='draft' AND (NEW.number IS NULL OR NEW.journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.journal_id AND j.company_id=NEW.company_id AND j.status='posted' AND j.source_type='trade.payment'
 AND j.source_id=NEW.id AND j.source_event='post'))
 BEGIN SELECT RAISE(ABORT,'Payment cannot post without matching journal'); END;
CREATE TRIGGER trade_payment_transition_guard BEFORE UPDATE OF status ON trade_payments
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('posted','voided')) OR (OLD.status='posted' AND NEW.status='reversed'))
 BEGIN SELECT RAISE(ABORT,'Invalid payment lifecycle transition'); END;
CREATE TRIGGER trade_payment_reversal_guard BEFORE UPDATE OF status ON trade_payments
 WHEN NEW.status='reversed' AND (NEW.reversal_journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.reversal_journal_id AND j.company_id=NEW.company_id AND j.reverses_id=OLD.journal_id AND j.status='posted') OR EXISTS (
 SELECT 1 FROM payment_allocations a WHERE a.payment_id=OLD.id AND
 NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)))
 BEGIN SELECT RAISE(ABORT,'Cannot reverse payment without valid reversal journal or while allocated'); END;
CREATE TRIGGER trade_payment_no_delete BEFORE DELETE ON trade_payments
 BEGIN SELECT RAISE(ABORT,'Payments cannot be deleted'); END;

CREATE TABLE payment_allocations (
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id), UNIQUE(company_id,request_key),
 FOREIGN KEY(company_id,invoice_id) REFERENCES trade_invoices(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,payment_id) REFERENCES trade_payments(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX payment_allocations_invoice ON payment_allocations(company_id,invoice_id);
CREATE INDEX payment_allocations_payment ON payment_allocations(company_id,payment_id);
CREATE TRIGGER payment_allocation_source_guard BEFORE INSERT ON payment_allocations
 WHEN NOT EXISTS (SELECT 1 FROM trade_invoices i JOIN trade_payments p
 ON p.company_id=i.company_id
 WHERE i.id=NEW.invoice_id AND p.id=NEW.payment_id AND i.company_id=NEW.company_id
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
 id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL,
 allocation_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,allocation_id), UNIQUE(company_id,request_key),
 FOREIGN KEY(company_id,allocation_id) REFERENCES payment_allocations(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER allocation_reversal_no_update BEFORE UPDATE ON allocation_reversals
 BEGIN SELECT RAISE(ABORT,'Allocation reversals are immutable'); END;
CREATE TRIGGER allocation_reversal_no_delete BEFORE DELETE ON allocation_reversals
 BEGIN SELECT RAISE(ABORT,'Allocation reversals are immutable'); END;

-- 0005 ai_operations
-- AI remains optional: provider secrets, work tracking, and approvals are scoped to a company.
-- No financial mutations are performed by triggers; those are owned by existing application services.
INSERT INTO permission_definitions(code,description) VALUES
 ('ai.configure','Manage company AI provider credentials'),
 ('ai.use','Use the AI assistant with company context'),
 ('ai.execute','Authorize AI-initiated routine business mutations'),
 ('ai.policy','Configure company AI autonomy policy');

INSERT INTO role_permissions(company_id,role_id,permission_code)
SELECT r.company_id,r.id,'ai.configure' FROM roles r
WHERE r.code='company-admin' AND r.system_role=1;
INSERT INTO role_permissions(company_id,role_id,permission_code)
SELECT r.company_id,r.id,'ai.use' FROM roles r
WHERE r.code IN ('company-admin','company-accountant','company-reader','company-operator') AND r.system_role=1;
INSERT INTO role_permissions(company_id,role_id,permission_code)
SELECT r.company_id,r.id,'ai.execute' FROM roles r
WHERE r.code IN ('company-admin','company-accountant','company-operator') AND r.system_role=1;
INSERT INTO role_permissions(company_id,role_id,permission_code)
SELECT r.company_id,r.id,'ai.policy' FROM roles r
WHERE r.code='company-admin' AND r.system_role=1;

CREATE TABLE ai_provider_configs (
 company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 base_url TEXT NOT NULL CHECK(length(base_url) BETWEEN 8 AND 512),
 model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 128),
 encrypted_api_key TEXT NOT NULL CHECK(length(encrypted_api_key) BETWEEN 32 AND 8192),
 supports_tools INTEGER NOT NULL DEFAULT 1 CHECK(supports_tools IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE ai_company_policies (
 company_id TEXT NOT NULL,
 auto_drafts INTEGER NOT NULL DEFAULT 1 CHECK(auto_drafts IN (0,1)),
 auto_post INTEGER NOT NULL DEFAULT 0 CHECK(auto_post IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(company_id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) STRICT;

-- Conversation history belongs to the signed-in user; it is never shared across companies or users.
CREATE TABLE ai_conversations (
 id TEXT PRIMARY KEY NOT NULL,
 company_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(company_id,user_id,id),
 FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX ai_conversations_user ON ai_conversations(company_id,user_id,archived,updated_at DESC);
CREATE TRIGGER ai_conversations_ownership_guard BEFORE UPDATE OF company_id,user_id ON ai_conversations
BEGIN SELECT RAISE(ABORT,'AI conversation ownership is immutable'); END;

CREATE TABLE ai_turns (
 id TEXT PRIMARY KEY NOT NULL,
 company_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 user_message TEXT NOT NULL CHECK(length(user_message) BETWEEN 1 AND 4000),
 context_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(context_json)),
 client_request_id TEXT NOT NULL CHECK(length(client_request_id) BETWEEN 1 AND 128),
 prompt_hash TEXT NOT NULL CHECK(length(prompt_hash)=64),
 status TEXT NOT NULL CHECK(status IN ('processing','completed','awaiting_approval','failed')),
 reply TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(company_id,user_id,client_request_id),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,user_id,conversation_id) REFERENCES ai_conversations(company_id,user_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX ai_turns_conversation ON ai_turns(company_id,user_id,conversation_id,created_at,id);
CREATE INDEX ai_turns_by_user ON ai_turns(company_id,user_id,created_at DESC);
CREATE INDEX ai_turns_rate_limit ON ai_turns(company_id,user_id,created_at DESC);

CREATE TABLE ai_actions (
 id TEXT PRIMARY KEY NOT NULL,
 turn_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 tool_name TEXT NOT NULL CHECK(length(tool_name) BETWEEN 1 AND 80),
 input_json TEXT NOT NULL CHECK(length(input_json) BETWEEN 2 AND 20000),
 preview_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(preview_json)),
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 state TEXT NOT NULL CHECK(state IN ('awaiting_approval','executing','completed','failed','rejected')),
 result_json TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(company_id,turn_id),
 FOREIGN KEY(company_id,turn_id) REFERENCES ai_turns(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX ai_actions_pending ON ai_actions(company_id,user_id,state);

-- The request/identity, company and action must never be moved to another security scope.
CREATE TRIGGER ai_turns_scope_immutable BEFORE UPDATE OF company_id,user_id,conversation_id,user_message,context_json,client_request_id,prompt_hash ON ai_turns
BEGIN SELECT RAISE(ABORT,'AI turn identity is immutable'); END;
CREATE TRIGGER ai_actions_scope_immutable BEFORE UPDATE OF company_id,user_id,turn_id,tool_name,input_json,preview_json,fingerprint ON ai_actions
BEGIN SELECT RAISE(ABORT,'AI action identity is immutable'); END;

-- 0006 access_and_tax
-- Company-scoped first-release extensions. Financial truth stays in posted journal lines.
INSERT INTO permission_definitions(code,description) VALUES
 ('tax.read','Read company tax-code schedule'),
 ('tax.manage','Configure dated company tax codes'),
 ('inventory.read','Read company stock catalogue and movements'),
 ('inventory.manage','Manage company stock movements and items'),
 ('documents.read','Read company attachments'),
 ('documents.manage','Upload and manage company attachments');
INSERT INTO role_permissions(company_id,role_id,permission_code)
 SELECT r.company_id,r.id,p.code FROM roles r
 JOIN permission_definitions p ON p.code IN ('tax.read','tax.manage','inventory.read','inventory.manage','documents.read','documents.manage')
 WHERE r.system_role=1 AND (
 (r.code='company-admin') OR
 (r.code='company-accountant' AND p.code IN ('tax.read','tax.manage','inventory.read','documents.read')) OR
 (r.code='company-reader' AND p.code IN ('tax.read','inventory.read','documents.read')) OR
 (r.code='company-operator' AND p.code IN ('tax.read','inventory.read','inventory.manage','documents.read','documents.manage')));

-- Tax schedules are append-only; invoice tax calculations are not yet wired into trade invoices.
CREATE TABLE tax_code_versions (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
 code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 32),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 effective_on TEXT NOT NULL CHECK(length(effective_on)=10 AND effective_on GLOB '????-??-??'),
 rate_ppm INTEGER NOT NULL CHECK(rate_ppm BETWEEN 0 AND 1000000),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,code,effective_on),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX tax_codes_for_date ON tax_code_versions(company_id,code,effective_on DESC);
CREATE TRIGGER tax_code_no_update BEFORE UPDATE ON tax_code_versions BEGIN SELECT RAISE(ABORT,'Tax schedule is append-only'); END;
CREATE TRIGGER tax_code_no_delete BEFORE DELETE ON tax_code_versions BEGIN SELECT RAISE(ABORT,'Tax schedule is append-only'); END;

-- 0007 inventory_quantity
-- Company stock quantities are explicitly operational, not valued accounting balances.
-- An inventory valuation/posting workflow must be added before declaring valued inventory support.
CREATE TABLE stock_items (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
 sku TEXT NOT NULL CHECK(length(sku) BETWEEN 1 AND 64),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 unit TEXT NOT NULL CHECK(length(trim(unit)) BETWEEN 1 AND 24),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,sku), UNIQUE(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE stock_movements (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
 item_id TEXT NOT NULL, happened_on TEXT NOT NULL CHECK(length(happened_on)=10 AND happened_on GLOB '????-??-??'),
 direction TEXT NOT NULL CHECK(direction IN ('in','out')),
 quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,request_key),
 FOREIGN KEY(company_id,item_id) REFERENCES stock_items(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX stock_movement_item ON stock_movements(company_id,item_id,happened_on,id);
CREATE TRIGGER stock_move_immutable BEFORE UPDATE ON stock_movements BEGIN SELECT RAISE(ABORT,'Stock movements are append-only'); END;
CREATE TRIGGER stock_move_no_delete BEFORE DELETE ON stock_movements BEGIN SELECT RAISE(ABORT,'Stock movements are append-only'); END;
CREATE TRIGGER stock_item_no_delete BEFORE DELETE ON stock_items BEGIN SELECT RAISE(ABORT,'Stock items cannot be deleted'); END;
CREATE TRIGGER stock_item_ownership BEFORE UPDATE OF company_id,sku ON stock_items
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

-- 0008 document_attachments
-- Attachment content is stored in a protected local blob root, never in SQLite.
CREATE TABLE document_attachments (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
 subject_type TEXT NOT NULL CHECK(subject_type IN ('invoice','payment','contact','journal')),
 subject_id TEXT NOT NULL,
 filename TEXT NOT NULL CHECK(length(trim(filename)) BETWEEN 1 AND 160),
 media_type TEXT NOT NULL CHECK(length(media_type) BETWEEN 1 AND 100),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 10485760),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,created_by) REFERENCES users(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX attachments_by_subject ON document_attachments(company_id,subject_type,subject_id);
CREATE TRIGGER attachment_metadata_immutable BEFORE UPDATE ON document_attachments BEGIN SELECT RAISE(ABORT,'Attachment metadata is append-only'); END;
CREATE TRIGGER attachment_metadata_no_delete BEFORE DELETE ON document_attachments BEGIN SELECT RAISE(ABORT,'Attachments are retained'); END;

-- 0009 credit_notes
-- Credit notes are limited to original invoice-line adjustments against unpaid balances.
-- Refunds for already settled invoices require a separate explicit workflow.
CREATE TABLE trade_credit_notes (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL, invoice_line_id TEXT NOT NULL, account_id TEXT NOT NULL,
 credited_on TEXT NOT NULL CHECK(length(credited_on)=10 AND credited_on GLOB '????-??-??'),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed','voided')),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, journal_id TEXT, reversal_journal_id TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,id), UNIQUE(company_id,request_key),
 FOREIGN KEY(company_id,invoice_id) REFERENCES trade_invoices(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(invoice_line_id) REFERENCES trade_invoice_lines(id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,account_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reversal_journal_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX credit_notes_by_invoice ON trade_credit_notes(company_id,invoice_id,status);
CREATE TRIGGER credit_note_immutable BEFORE UPDATE ON trade_credit_notes
 WHEN OLD.status<>'draft' AND (NEW.company_id<>OLD.company_id
 OR NEW.invoice_id<>OLD.invoice_id OR NEW.invoice_line_id<>OLD.invoice_line_id OR NEW.account_id<>OLD.account_id
 OR NEW.amount_minor<>OLD.amount_minor OR NEW.credited_on<>OLD.credited_on OR NEW.reason<>OLD.reason
 OR NEW.request_key<>OLD.request_key OR NEW.fingerprint<>OLD.fingerprint OR NEW.journal_id IS NOT OLD.journal_id
 OR (NEW.reversal_journal_id IS NOT OLD.reversal_journal_id AND NOT (OLD.status='posted' AND NEW.status='reversed')))
 BEGIN SELECT RAISE(ABORT,'Credit note is immutable after posting'); END;
CREATE TRIGGER credit_note_status_guard BEFORE UPDATE OF status ON trade_credit_notes
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('posted','voided')) OR (OLD.status='posted' AND NEW.status='reversed'))
 BEGIN SELECT RAISE(ABORT,'Invalid credit note lifecycle'); END;
CREATE TRIGGER credit_note_post_guard BEFORE UPDATE OF status ON trade_credit_notes
 WHEN NEW.status='posted' AND (NEW.journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.journal_id AND j.company_id=NEW.company_id AND j.status='posted' AND j.source_type='trade.credit_note' AND j.source_id=NEW.id))
 BEGIN SELECT RAISE(ABORT,'Credit note must have a posted source journal'); END;
CREATE TRIGGER credit_note_no_delete BEFORE DELETE ON trade_credit_notes BEGIN SELECT RAISE(ABORT,'Credit notes cannot be deleted'); END;
-- A posted credit cannot exceed its source line or create a negative invoice balance.
CREATE TRIGGER credit_note_line_and_limit_guard AFTER UPDATE OF status ON trade_credit_notes
WHEN NEW.status='posted' AND (
 NOT EXISTS(SELECT 1 FROM trade_invoices i JOIN trade_invoice_lines l ON l.invoice_id=i.id
 WHERE i.id=NEW.invoice_id AND i.company_id=NEW.company_id
 AND i.status='posted' AND l.id=NEW.invoice_line_id AND l.account_id=NEW.account_id)
 OR bigint_le((SELECT bigint_total(amount_minor) FROM trade_credit_notes
 WHERE invoice_line_id=NEW.invoice_line_id AND status='posted'),
 (SELECT line_total_minor FROM trade_invoice_lines WHERE id=NEW.invoice_line_id))=0
 OR bigint_le((SELECT bigint_total(amount_minor) FROM trade_credit_notes WHERE invoice_id=NEW.invoice_id AND status='posted'),
 (SELECT total_minor - COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.invoice_id=NEW.invoice_id
 AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)),0)
 FROM trade_invoices WHERE id=NEW.invoice_id))=0)
BEGIN SELECT RAISE(ABORT,'Credit exceeds unallocated source invoice value'); END;
CREATE TRIGGER allocation_credit_limit_guard AFTER INSERT ON payment_allocations
WHEN bigint_le((SELECT bigint_total(a.amount_minor) FROM payment_allocations a WHERE a.invoice_id=NEW.invoice_id
 AND NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)),
 (SELECT total_minor-COALESCE((SELECT SUM(amount_minor) FROM trade_credit_notes c
 WHERE c.invoice_id=NEW.invoice_id AND c.status='posted'),0) FROM trade_invoices WHERE id=NEW.invoice_id))=0
BEGIN SELECT RAISE(ABORT,'Allocation exceeds remaining credited invoice amount'); END;
CREATE TRIGGER invoice_active_credits_reversal_guard BEFORE UPDATE OF status ON trade_invoices
WHEN NEW.status='reversed' AND EXISTS(SELECT 1 FROM trade_credit_notes WHERE invoice_id=OLD.id AND status='posted')
BEGIN SELECT RAISE(ABORT,'Reverse credit notes before reversing the original invoice'); END;
CREATE TRIGGER credit_note_reversal_guard BEFORE UPDATE OF status ON trade_credit_notes
WHEN NEW.status='reversed' AND (NEW.reversal_journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.reversal_journal_id AND j.company_id=NEW.company_id AND j.status='posted' AND j.reverses_id=OLD.journal_id))
BEGIN SELECT RAISE(ABORT,'Credit note requires a valid reversal journal'); END;

-- 0010 contact_imports
-- Idempotent company contact import batches; commit metadata and contacts atomically.
CREATE TABLE contact_import_batches (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
 batch_key TEXT NOT NULL, fingerprint TEXT NOT NULL, row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 500),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,batch_key),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER contact_import_batch_immutable BEFORE UPDATE ON contact_import_batches BEGIN SELECT RAISE(ABORT,'Import batches are immutable'); END;
CREATE TRIGGER contact_import_batch_no_delete BEFORE DELETE ON contact_import_batches BEGIN SELECT RAISE(ABORT,'Import batches are immutable'); END;

-- Per-company account mappings for ordinary business workflows.
-- The source documents and journal lines still carry immutable account references.
CREATE TABLE posting_defaults (
 company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 receivables_id TEXT NOT NULL,
 payables_id TEXT NOT NULL,
 revenue_id TEXT NOT NULL,
 expense_id TEXT NOT NULL,
 cash_id TEXT NOT NULL,
 FOREIGN KEY(company_id,receivables_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,payables_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,revenue_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,expense_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,cash_id) REFERENCES ledger_accounts(company_id,id) ON DELETE RESTRICT,
 CHECK (receivables_id<>cash_id)
) STRICT;
CREATE TRIGGER posting_defaults_validate_insert BEFORE INSERT ON posting_defaults
BEGIN
 SELECT CASE WHEN (
   (SELECT count(*) FROM ledger_accounts a WHERE a.company_id=NEW.company_id AND a.active=1 AND a.postable=1 AND
    ((a.id=NEW.receivables_id AND a.category='asset') OR
     (a.id=NEW.payables_id AND a.category='liability') OR
     (a.id=NEW.revenue_id AND a.category='revenue') OR
     (a.id=NEW.expense_id AND a.category='expense') OR
     (a.id=NEW.cash_id AND a.category='asset'))) < 5
 ) THEN RAISE(ABORT,'Invalid posting defaults: accounts must be active, postable and correctly categorized') END;
END;
CREATE TRIGGER posting_defaults_validate_update BEFORE UPDATE ON posting_defaults
BEGIN
 SELECT CASE WHEN (
   (SELECT count(*) FROM ledger_accounts a WHERE a.company_id=NEW.company_id AND a.active=1 AND a.postable=1 AND
    ((a.id=NEW.receivables_id AND a.category='asset') OR
     (a.id=NEW.payables_id AND a.category='liability') OR
     (a.id=NEW.revenue_id AND a.category='revenue') OR
     (a.id=NEW.expense_id AND a.category='expense') OR
     (a.id=NEW.cash_id AND a.category='asset'))) < 5
 ) THEN RAISE(ABORT,'Invalid posting defaults') END;
END;
CREATE TRIGGER posting_defaults_prevent_disable BEFORE UPDATE OF active ON ledger_accounts
WHEN NEW.active=0 AND EXISTS(SELECT 1 FROM posting_defaults p WHERE p.company_id=OLD.company_id
 AND OLD.id IN(p.receivables_id,p.payables_id,p.revenue_id,p.expense_id,p.cash_id))
BEGIN SELECT RAISE(ABORT,'Account is configured as a posting default'); END;
