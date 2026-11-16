# Installation, deployment, and recovery baseline

## Runtime assumption

Node 24 (primary; supported 22.16+ and 26), one Node.js process per installation on Windows, macOS, or Linux. Local SQLite database file, managed local attachment directory and separate log directory. Bind to localhost by default; LAN sharing requires explicit configuration, TLS, and credentials. Core operations must remain functional without internet. No browser offline-sync in v1.

## SQLite operating rules

- Enable `foreign_keys=ON` and configure journal mode, busy timeout, integrity checks and WAL checkpoint policy per connection.
- SQLite WAL permits concurrent readers with one writer; keep transactions short and never make network calls in them.
- Never place an active SQLite WAL database on network filesystems.
- Do not copy a live `.db` file alone and assume consistency; use online backup API (or equivalent consistent snapshot), coupled with attachment manifest/checksums.
- Verify restore into a fresh directory and run `integrity_check`, foreign-key checks and application version compatibility checks before serving users.

## CLI design targets

`app init`, `app doctor`, `app db migrate`, `app organization create`, `app company create`, `app user create`, `app backup create|verify|restore`, `app server start`. Phases 2–3 implement an offline administrative subset under `node scripts/app.ts` (`setup`, `doctor`, `db:migrate`, `db:status`, `db:check`, `backup:create`, `backup:verify`, `backup:restore`). Phase 3 adds local organization/company/administrator bootstrap and local-admin password recovery, plus authenticated application-service APIs for staff and companies. Server startup and the frontend remain future integration tasks. See [identity bootstrap](identity-bootstrap.md). See [actual CLI documentation](database-cli.md). Require safe interactive secret input, structured errors, documented exit codes and dry-run for destructive restore.

## Backup consistency considerations

Two stores (database + attachments) need a coordinated restore point. Safest first implementation: briefly quiesce attachment writes while generating a database snapshot and a content/checksum manifest. Backups should be signed/hashed and optionally encrypted; maintain recovery instructions and test a complete restore. Target RPO <= 1 hour and RTO <= 4 hours are proposals, not measured guarantees.

## Reliability and threat model

Protect from process crash during posting, disk-full, failed migrations, interrupted backups, disk corruption, accidental deletion, lost credentials, misconfigured LAN exposure, unsafe file downloads and database busy errors. A backup without a verified restore is not treated as recovered capability.
