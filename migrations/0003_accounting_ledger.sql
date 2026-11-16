-- Per-legal-company accounting: exact integer minor units, company-scoped references.
-- Staging headers are created, populated and posted within a single writer transaction.
INSERT INTO permission_definitions(code, scope, description) VALUES
 ('accounting.configure','company','Configure accounting books, currencies and accounts'),
 ('accounting.reverse','company','Reverse posted financial entries'),
 ('accounting.close','company','Close or reopen fiscal periods');
INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
 SELECT r.organization_id,r.id,'company',p.code FROM roles r
 JOIN permission_definitions p ON p.code IN ('accounting.configure','accounting.reverse','accounting.close')
 WHERE r.scope='company' AND r.system_role=1 AND r.code IN ('company-admin','company-accountant');

CREATE TABLE accounting_books (
 organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 base_currency TEXT NOT NULL CHECK(length(base_currency)=3),
 timezone TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(organization_id,company_id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE accounting_currencies (
 organization_id TEXT NOT NULL, company_id TEXT NOT NULL, code TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 decimals INTEGER NOT NULL CHECK(decimals BETWEEN 0 AND 6),
 PRIMARY KEY(organization_id,company_id,code),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT,
 CHECK (length(code)=3 AND code GLOB '[A-Z][A-Z][A-Z]')
) STRICT;
CREATE TRIGGER accounting_books_base_locked BEFORE UPDATE OF base_currency ON accounting_books
 BEGIN SELECT RAISE(ABORT,'Base currency is immutable; establish a new book for changes'); END;
CREATE TRIGGER accounting_currency_precision_locked BEFORE UPDATE OF decimals,code ON accounting_currencies
 BEGIN SELECT RAISE(ABORT,'Currency precision is immutable'); END;

CREATE TABLE fiscal_periods (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 code TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id), UNIQUE(organization_id,company_id,code),
 CHECK (starts_on <= ends_on),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX fiscal_period_dates ON fiscal_periods(organization_id,company_id,starts_on,ends_on);
CREATE TRIGGER fiscal_period_no_overlap_insert BEFORE INSERT ON fiscal_periods
 WHEN EXISTS(SELECT 1 FROM fiscal_periods p WHERE p.organization_id=NEW.organization_id AND p.company_id=NEW.company_id AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on)
 BEGIN SELECT RAISE(ABORT,'Overlapping fiscal periods'); END;
CREATE TRIGGER fiscal_period_dates_immutable BEFORE UPDATE OF starts_on,ends_on,organization_id,company_id ON fiscal_periods
 BEGIN SELECT RAISE(ABORT,'Fiscal period dates and ownership are immutable'); END;

CREATE TABLE ledger_accounts (
 id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 code TEXT NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 category TEXT NOT NULL CHECK(category IN ('asset','liability','equity','revenue','expense')),
 parent_id TEXT, postable INTEGER NOT NULL DEFAULT 1 CHECK(postable IN (0,1)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id), UNIQUE(organization_id,company_id,code),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,parent_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT,
 CHECK(parent_id IS NULL OR parent_id<>id)
) STRICT;
CREATE INDEX ledger_accounts_directory ON ledger_accounts(organization_id,company_id,category,code);
CREATE TRIGGER ledger_accounts_ownership_immutable BEFORE UPDATE OF organization_id,company_id,category,parent_id,code,postable ON ledger_accounts
 BEGIN SELECT RAISE(ABORT,'Account structure is immutable'); END;
CREATE TRIGGER ledger_accounts_parent_guard BEFORE INSERT ON ledger_accounts
 WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ledger_accounts p WHERE p.id=NEW.parent_id AND p.organization_id=NEW.organization_id
  AND p.company_id=NEW.company_id AND p.category=NEW.category AND p.postable=0 AND p.active=1
 ) BEGIN SELECT RAISE(ABORT,'Invalid parent account'); END;

CREATE TABLE journal_entries (
 entry_number INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 period_id TEXT NOT NULL, posted_on TEXT NOT NULL,
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_event TEXT NOT NULL,
 idempotency_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'staging' CHECK(status IN ('staging','posted')),
 reverses_id TEXT,
 base_currency TEXT NOT NULL,
 posted_by TEXT NOT NULL,
 posted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id),
 UNIQUE(organization_id,company_id,source_type,source_id,source_event),
 UNIQUE(organization_id,company_id,idempotency_key),
 UNIQUE(organization_id,company_id,reverses_id),
 FOREIGN KEY(organization_id,company_id) REFERENCES accounting_books(organization_id,company_id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,period_id) REFERENCES fiscal_periods(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,reverses_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,posted_by) REFERENCES users(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX journal_entries_by_date ON journal_entries(organization_id,company_id,posted_on,id);
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
      ON b.organization_id=p.organization_id AND b.company_id=p.company_id
    WHERE p.id=NEW.period_id AND p.organization_id=NEW.organization_id AND p.company_id=NEW.company_id
      AND p.status='open' AND p.starts_on<=NEW.posted_on AND p.ends_on>=NEW.posted_on
      AND b.base_currency=NEW.base_currency
   ) THEN RAISE(ABORT,'Posting requires an open matching fiscal period and base currency') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM journal_lines l JOIN ledger_accounts a
      ON a.id=l.account_id AND a.organization_id=l.organization_id AND a.company_id=l.company_id
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
 organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
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
 FOREIGN KEY(organization_id,company_id,journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,account_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,currency) REFERENCES accounting_currencies(organization_id,company_id,code) ON DELETE RESTRICT
) STRICT;
CREATE INDEX journal_lines_by_account ON journal_lines(organization_id,company_id,account_id,journal_id);
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
   WHERE j.id=NEW.journal_id AND j.organization_id=NEW.organization_id AND j.company_id=NEW.company_id
     AND ((NEW.currency=j.base_currency AND NEW.rate_numerator IS NULL)
       OR (NEW.currency<>j.base_currency AND NEW.rate_numerator IS NOT NULL))
 ) BEGIN SELECT RAISE(ABORT,'Invalid journal currency or FX snapshot'); END;

-- Auditable status transition and source provenance, without independent balances.
CREATE TRIGGER fiscal_period_close_guard BEFORE UPDATE OF status ON fiscal_periods
 WHEN NEW.status='closed' AND OLD.status='open' AND EXISTS(
  SELECT 1 FROM journal_entries j WHERE j.period_id=OLD.id AND j.status='staging'
 ) BEGIN SELECT RAISE(ABORT,'Unposted journals in period'); END;
