# Complete application backup and recovery

**There is one supported backup format.** `backup:create` writes a directory bundle containing a consistent SQLite snapshot, exactly the immutable attachment blobs referenced by that snapshot, and a manifest containing SHA-256 hashes. `backup:verify` validates database integrity, attachment membership and all hashes; `backup:restore` restores into **new, non-existing** database and attachment destinations.

## Bundle structure

```text
accounting-<timestamp>-<id>.bundle/
├── database.sqlite
├── manifest.json
└── blobs/<company-id>/<attachment-id>.blob
```

The timestamped `.partial` directory created during snapshotting is an **atomic write staging location**, not a second supported format. Failed backups remove it; only verified bundles are renamed into their final paths.

## CLI

```sh
corepack pnpm app:backup -- --json
corepack pnpm app:backup-verify -- --source ./var/backups/BUNDLE_NAME.bundle
corepack pnpm app:restore -- --source ./var/backups/BUNDLE_NAME.bundle --target ./var/data/restored.sqlite --target-attachments ./var/restored-attachments
```

Configure `APP_DB_PATH`, `APP_ATTACHMENT_DIR`, and `APP_BACKUP_DIR` in `.env` or environment. Source storage must be local and protected from untrusted filesystem users. Restores refuse existing targets and avoid overwriting live databases. Final database and blob hashes are checked after copying.

Attachments are immutable, and the database snapshot chooses the committed attachment set. If attachments ever become mutable or deletable, reconsider snapshot consistency before deploying those changes.

## Operational responsibilities

Verification detects accidental corruption but does not authenticate a bundle against an attacker who can modify both files and manifest. Encrypt and retain backup copies outside the server, protect the manifest, back up the separate AI master key securely, and periodically perform a recovery drill. Scheduling, retention, offsite replication, and production cutover are not automated by this repository. Restore onto fresh paths with the application stopped before transferring production traffic.
