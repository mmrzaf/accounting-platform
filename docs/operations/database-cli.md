# Local database operations

The Phase 2 administrative CLI exists at `scripts/app.ts`. It uses only Node built-in modules. Commands accept `--json` and `--database PATH` where applicable.

| Action | Example | Important behavior |
|---|---|---|
| Diagnose | `node scripts/app.ts doctor --json` | Version/config hints, no secret values |
| Prepare | `node scripts/app.ts setup` | Creates directories only; idempotent |
| Migrate | `node scripts/app.ts db:migrate` | Atomic, checksummed SQL, safe rerun |
| Inspect | `node scripts/app.ts db:status` | Rejects altered/unknown migration history |
| Verify | `node scripts/app.ts db:check` | SQLite integrity/foreign keys |
| Backup | `node scripts/app.ts backup:create --output ./var/backups` | Consistent SQLite snapshot + SHA-256 manifest |
| Verify backup | `node scripts/app.ts backup:verify --source ./var/backups/SNAPSHOT.sqlite` | Digest and SQLite integrity |
| Restore copy | `node scripts/app.ts backup:restore --source SNAPSHOT.sqlite --target ./var/restore.sqlite` | New path only; refuses overwrite |

`--database` uses a local file path. Avoid running a production instance from shared/network storage (SQLite WAL requires local storage). Backup paths should have restricted filesystem permissions and be stored separately from the live database.

**Scope warning:** These snapshot commands currently cover **SQLite only**. They do not yet back up or restore attachments, configuration secrets, or any future object/file storage. They are not a complete production disaster-recovery process. Restoring a live installation requires an offline runbook, coordinated file snapshot, and service shutdown; do not use `backup:restore` as in-place live replacement.

A checksum detects accidental corruption. It does **not** prove authenticity against an attacker who can alter both the backup and its manifest. Signed or authenticated backup manifests and encryption-at-rest are future operational decisions.
