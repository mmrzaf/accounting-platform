# Complete database and attachment recovery

## Why two backup formats exist

`backup:create` and `src/platform/backup/backups.ts` are **legacy SQLite-only** snapshots. They are NOT a complete application backup after attachments have been enabled. Do not use them as the only production recovery method.

`backup:complete` writes a *directory bundle* containing:

- `database.sqlite` — committed SQLite snapshot created by the online backup API and normalized out of WAL mode;
- `blobs/<organization-id>/<company-id>/<attachment-id>.blob` — exactly the immutable attachments referenced by the snapshot;
- `manifest.json` — versioned scope and SHA-256 checksums of every referenced object.

`verifyCompleteBackup` checks the snapshot's integrity and foreign keys, confirms the manifest exactly matches database metadata, hashes each file, and rejects unlisted files and symlinks. An incomplete, missing, modified, or truncated blob makes creation or verification fail. Checksum verification detects accidental corruption; **SHA-256 alone does not provide authenticity against an attacker who can change the manifest too**. Protect the backup directory and keep offline copies.

## Usage

Run migrations and bootstrap first; then specify a dedicated attachment root, preferably via `.env`:

```sh
APP_ATTACHMENT_DIR=./var/attachments
```

The CLI reads `.env`; it does not create or discover attachments on its own.

```sh
npm run app:backup-complete -- --json
npm run app:backup-complete-verify -- --source ./var/backups/accounting-....bundle
npm run app:backup-complete-restore -- --source ./var/backups/accounting-....bundle --target ./var/data/restored.sqlite --target-attachments ./var/restored-attachments
```

A completed bundle **must** be verified, copied to storage outside the live server, and periodically restored to a fresh installation as an exercise. Both restore destinations must not exist. The restore refuses overwrite and cleans up files it created if a copy or integrity check fails.

## Consistency and runtime safety

Current attachments are immutable on disk and their metadata is inserted after the file is written, within a SQLite transaction. Consequently a SQLite snapshot first, followed by copying only its referenced blobs, captures a coherent committed set even if new attachments arrive concurrently. This guarantee will require reevaluation if blob deletion, replacement, deduplication, or in-place updates are introduced.

Never modify a `.bundle` by hand. Do not write to a snapshot database during verification. Do not put an active SQLite WAL database on a network filesystem. Treat complete bundles as confidential financial data: use filesystem permissions and encrypted storage, with offsite retention and key management appropriate to the organization.

## Current limitations

- Backups are initiated explicitly; scheduling, retention, offsite replication and encryption-at-rest are operator responsibilities.
- No live *automatic* maintenance scheduler is shipped.
- Restoration is into new paths, not an in-place production rollback. Shut down the server and arrange a controlled cutover after checking migration status and financial totals.
- Multi-process deployments and concurrent destructive blob changes are not supported.
