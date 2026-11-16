# Engineering conventions and boundaries

## Source placement

- `src/shared`: transport-safe primitives/contracts, no Node/browser/platform dependencies.
- `src/modules/identity`: Phase 3 security and account application services; no UI/AI adapter may bypass these checks.
- `src/platform/http`: framework-neutral Web Request/Response identity HTTP boundary; it is not a deployed server.
- `src/platform`: configuration, structured logging, database migration/health and backup tooling.
- `src/ui`: locale and CSS design tokens; no app routes yet.
- `scripts`: thin Node CLI/verification adapters.
- `migrations`: immutable ordered SQL source files, SHA-256-checked after application.
- `tests/infrastructure`: executable tests of the foundation; `experiments/sqlite-feasibility` remains prior historical evidence.

## Error and operational behavior

- Explicit CLI exit status `0` on success; nonzero on failure, with machine-readable `--json` output.
- Never expose sensitive values in logs. The logger only accepts known-safe contextual fields.
- No implicit network binding beyond loopback; LAN exposure requires a deliberate host setting AND a future authenticated HTTPS configuration.
- Migrations never silently repair checksums or skip history gaps. Foreign keys are enabled on every opened connection.
- Data modifications are transactional; Phase 3 identity services are implemented, but financial tables, real financial services and frontend are still absent.
- Backups are online SQLite snapshots, with SHA-256 and integrity verification. `backup:restore` only writes to a **new** database path.
- Review `docs/decisions/decision-register.md` before deriving schema from pending product decisions.

## Quality contracts

`npm run verify`: documentation links, JS syntax, strict TypeScript foundation contracts, historical and Phase 2–3 tests. Run it before committing. `git diff --check`, `git status --short`, and a new extraction test are separate release checks. Do not report Node 24/26, CI, pnpm frozen install or UI framework build as passing unless those operations actually run.
