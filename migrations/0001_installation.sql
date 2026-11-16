-- Phase 2 infrastructure metadata only. No organization, user or financial schema yet.
CREATE TABLE installation_settings (
  key TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
