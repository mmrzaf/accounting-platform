# Accounting Platform

A **TypeScript modular monolith** for company-scoped accounting and trading operations, with optional AI-assisted business commands. This repository contains a SQLite-backed service implementation, a local Node HTTP API, a CLI, migrations, and regression tests. **It is not a finished accounting product:** the planned React/TanStack browser application, Drizzle integration, and several financial workflows are not implemented.

## Implemented components

| Area | Current functionality |
|---|---|
| Identity | Organization/company boundaries, local users, sessions, role permissions, bootstrap and administrator recovery |
| Accounting | Company books, fiscal periods, accounts, exact monetary posting, immutable journals and reversals, ledger and trial balance |
| Trading | Contacts, purchase/sale invoices, receipts/payments, allocations, credit notes for unpaid invoices |
| Extensions | Quantity-only stock, dated tax schedules, CSV contact imports, checksum-protected local attachments, selected financial reports |
| AI | Configurable OpenAI-compatible provider, bounded tools, permission-aware execution and approval records |
| Infrastructure | Local loopback HTTP API, forward-only SQLite migrations, complete database+attachment backup/verify/restore |

Financial amounts are integer minor units, not JavaScript floating-point values. Organization and company access must be enforced in the service and database layers—not merely the HTTP interface. AI and human callers share the same business operations.

## Runtime and project conventions

- **Node.js 24** is the primary target; **22.16+ and 26** are compatibility targets, not certified runtime results.
- `pnpm@10.20.0` is pinned. Source files are TypeScript (`.ts`); generated JavaScript is excluded from Git.
- Application code is organized under `src/modules/`, platform adapters under `src/platform/`, and the CLI under `scripts/`.
- Database migrations in `migrations/` are checksummed and append-only. Never rewrite applied SQL migrations.
- A locally available TypeScript compiler is needed to typecheck/build. Package installation and other platform/runtime validation still need to be performed on the target systems.

## Development and operations

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm app:bootstrap -- --slug example --name "Example" --admin-username owner --admin-name "Owner"
corepack pnpm app:serve
```

The bootstrap command prompts privately for the administrator password. Default HTTP listener: `127.0.0.1:3000`. There is **no user-facing web application** at the root URL; API routes are documented under `docs/api/`. LAN access requires a separate HTTPS reverse proxy to the loopback listener. See [server operations](docs/operations/local-server.md).

**Backups always include the database and referenced attachment blobs.** There is no SQLite-only public backup command:

```sh
corepack pnpm app:backup -- --json
corepack pnpm app:backup-verify -- --source ./var/backups/BUNDLE_NAME.bundle
corepack pnpm app:restore -- --source ./var/backups/BUNDLE_NAME.bundle --target ./var/data/restored.sqlite --target-attachments ./var/restored-attachments
```

See [backup and recovery](docs/operations/complete-backups.md). Database and backup locations default to `var/` and are excluded from Git.

## Project references

- [Implementation status, unresolved work and review limits](docs/validation/implementation-status.md)
- [Release validation gates](docs/validation/release-gates.md)
- [Architecture and module ownership](docs/architecture/modules.md)
- [Accounting invariants](docs/accounting/accounting-core.md) and [current ledger behavior](docs/accounting/implemented-ledger.md)
- [Authorization policy](docs/security/authorization.md) and [AI execution](docs/ai/autonomy.md)
- [Trading operations](docs/domain/trading-workflows.md), [extension limitations](docs/domain/first-release-extensions.md)
- [Development conventions](docs/development/getting-started.md), [remaining work](docs/roadmap/open-work.md), and [agent guidance](AGENTS.md)

The Git history retains earlier implementation milestones. Historical reports are not current specifications or evidence that the latest changes passed tests.
