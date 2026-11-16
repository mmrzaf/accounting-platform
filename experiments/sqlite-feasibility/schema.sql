-- PHASE 1 TECHNICAL SPIKE ONLY. NOT A PRODUCTION SCHEMA OR MIGRATION.
-- Deliberately small to verify SQLite STRICT, composite FKs, scoped uniqueness,
-- transactional journal creation, and bigint retrieval on an actual file.
CREATE TABLE organizations (
  organization_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE companies (
  organization_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (organization_id, company_id),
  FOREIGN KEY (organization_id)
    REFERENCES organizations (organization_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE accounts (
  organization_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  code TEXT NOT NULL,
  PRIMARY KEY (organization_id, company_id, account_id),
  UNIQUE (organization_id, company_id, code),
  FOREIGN KEY (organization_id, company_id)
    REFERENCES companies (organization_id, company_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE documents (
  organization_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'posted')),
  PRIMARY KEY (organization_id, company_id, document_id),
  FOREIGN KEY (organization_id, company_id)
    REFERENCES companies (organization_id, company_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE journals (
  organization_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  journal_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, company_id, journal_id),
  UNIQUE (organization_id, company_id, source_event_id),
  UNIQUE (organization_id, company_id, idempotency_key),
  FOREIGN KEY (organization_id, company_id, document_id)
    REFERENCES documents (organization_id, company_id, document_id)
    ON DELETE RESTRICT
) STRICT;

CREATE TABLE journal_lines (
  organization_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  journal_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number >= 1),
  account_id TEXT NOT NULL,
  debit_minor INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  PRIMARY KEY (organization_id, company_id, journal_id, line_number),
  FOREIGN KEY (organization_id, company_id, journal_id)
    REFERENCES journals (organization_id, company_id, journal_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, company_id, account_id)
    REFERENCES accounts (organization_id, company_id, account_id)
    ON DELETE RESTRICT,
  CHECK ((debit_minor > 0 AND credit_minor = 0)
      OR (credit_minor > 0 AND debit_minor = 0))
) STRICT;

CREATE INDEX journal_by_document
  ON journals (organization_id, company_id, document_id);
