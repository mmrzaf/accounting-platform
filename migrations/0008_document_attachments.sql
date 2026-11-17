-- Attachment content is stored in a protected local blob root, never in SQLite.
CREATE TABLE document_attachments (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 subject_type TEXT NOT NULL CHECK(subject_type IN ('invoice','payment','contact','journal')),
 subject_id TEXT NOT NULL,
 filename TEXT NOT NULL CHECK(length(trim(filename)) BETWEEN 1 AND 160),
 media_type TEXT NOT NULL CHECK(length(media_type) BETWEEN 1 AND 100),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 10485760),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX attachments_by_subject ON document_attachments(organization_id,company_id,subject_type,subject_id);
CREATE TRIGGER attachment_metadata_immutable BEFORE UPDATE ON document_attachments BEGIN SELECT RAISE(ABORT,'Attachment metadata is append-only'); END;
CREATE TRIGGER attachment_metadata_no_delete BEFORE DELETE ON document_attachments BEGIN SELECT RAISE(ABORT,'Attachments are retained'); END;

