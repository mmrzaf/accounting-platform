# Local database and administrator commands

All commands are invoked through `corepack pnpm <script>` or `node --experimental-strip-types scripts/app.ts <command>`. Add `--json` to get structured output. The installation owns a single SQLite database and attachment root.

| Operation | Script | Behavior |
|---|---|---|
| Initialize directories | `setup` | Creates private application directories; does not initialize the database |
| Diagnose | `app:doctor` | Node version, database presence and configuration summary |
| Apply migrations | `db:migrate` | Forward-only, checksummed migrations |
| Inspect migrations | `db:status` | Applied/pending migration status |
| Check integrity | `db:check` | SQLite integrity and foreign-key verification |
| Bootstrap | `app:bootstrap` | First company and administrator; secure password prompt |
| Local recovery | `app:recover-admin` | Privileged administrator password reset, not an HTTP action |
| Start API | `app:serve` | Loopback-only HTTP service |
| Create complete backup | `app:backup` | Snapshot database with all referenced attachment files |
| Verify complete backup | `app:backup-verify` | Check bundle, checksums, SQLite integrity and attachment manifest |
| Restore complete backup | `app:restore` | New database and attachment paths only; never overwrite |

Database migration and backup directories must reside on appropriate local storage. The application intentionally refuses public HTTP binds. See [server operation](local-server.md) and [complete backup specification](complete-backups.md) for flags and safety requirements.
