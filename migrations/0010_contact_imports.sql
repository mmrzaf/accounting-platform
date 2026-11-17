-- Idempotent organization-directory import batches; commit metadata and contacts atomically.
CREATE TABLE contact_import_batches (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 batch_key TEXT NOT NULL, fingerprint TEXT NOT NULL, row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 500),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,batch_key),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE TRIGGER contact_import_batch_immutable BEFORE UPDATE ON contact_import_batches BEGIN SELECT RAISE(ABORT,'Import batches are immutable'); END;
CREATE TRIGGER contact_import_batch_no_delete BEFORE DELETE ON contact_import_batches BEGIN SELECT RAISE(ABORT,'Import batches are immutable'); END;
