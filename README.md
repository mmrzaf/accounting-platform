# Accounting Platform

**Start with [START-HERE.md](START-HERE.md).** The source is a TypeScript modular monolith for small-business accounting with one **Company** as its only security and accounting boundary. One user belongs permanently to one company; the server resolves company ownership from the user's session. There is no company or tenant selection, including at login.

The repository contains a SQLite-backed accounting and business service, Node HTTP API, React/TanStack Router browser client, CLI, migrations, and regression tests. **Not certified for real financial use:** the browser needs a dependency-backed build and E2E/UX acceptance; significant financial and regulatory workflows remain incomplete.

## What exists

| Area | Implemented today |
|---|---|
| Company and access | Installation-level company bootstrap; unique usernames; users belong to one company; scoped RBAC, sessions, password recovery and audit |
| Accounting | One company ledger, chart, periods, configurable posting defaults, integer-money journals, immutable posting/reversal and reconciled ledger reporting, guarded basic starter chart |
| Business operations | Contacts, non-stock multi-line sales/purchases, atomic invoice/payment posting, partial allocations, restricted credit notes |
| Extensions | Quantity inventory, effective-dated tax codes, CSV contacts, company-owned attachments, selected reports |
| AI | Optional contextual assistant, user-owned conversations, bounded read tools, atomic purchase/sale with optional payment, settlement commands, approval cards, role-scoped execution, stale-turn recovery and audit (live provider and UI acceptance unverified) |
| Interface | Username/password sign-in; revised responsive shell and guided initial accounting setup, bilingual RTL/LTR, useful empty states, contextual AI readiness, invoice/payment entry, contact directory, stock catalogue, ledger drill-down, invoice print and trial-balance CSV (browser acceptance pending) |
| Operations | Complete DB+attachment backups, migrations, diagnosis, local HTTP server |

This is deliberately **one Company level**. A local installation may store several independent companies, but their users and records cannot overlap. Company creation is CLI-only. The backend does not trust company identifiers supplied by the browser.

## First run with pnpm (no Corepack required)

Use Node **24** (primary), or Node **22.16+ / 26** (compatibility targets), and `pnpm@10.20.0`.

```sh
pnpm install --frozen-lockfile
pnpm --dir web install --no-frozen-lockfile  # initial web lockfile generation only
pnpm run verify
pnpm run web:check
pnpm run web:build
pnpm --dir web exec playwright install --with-deps chromium
pnpm run web:e2e
pnpm run setup
pnpm run db:migrate
pnpm run app:bootstrap -- --name "Example Company" --admin-username owner --admin-name "Owner"
pnpm run app:serve
```

Enter the administrator password when prompted. Visit `http://127.0.0.1:3000` and sign in with **username and password only**. The default listener is loopback-only. The browser lockfile must be reviewed and committed on a connected machine, followed by frozen installations. The web build must be validated on your machine. The first-run dashboard guides book, chart, and fiscal-period setup. Optional AI encryption can be initialized with `pnpm run app:ai-initialize`; configure the model in Settings and restart the server. For actual machine setup, use [START-HERE](START-HERE.md).

**Important:** Use `pnpm run setup` rather than `pnpm setup`; the latter invokes pnpm's own built-in setup operation.

## Architecture and engineering

- Exact financial amounts use integer minor units and `bigint` arithmetic; journal posting is transactional and audited.
- Authentication/roles/company ownership are enforced in services and database constraints, not React.
- `src/modules` holds domain/application services; `src/platform` holds SQLite/HTTP/backup adapters; `web` is presentation only.
- `migrations/` defines the **new company-only baseline**. All future migrations must be append-only; never rewrite already-applied new-baseline migrations.
- TypeScript is strict, and the new shell uses restrained components, accessible focus states, and RTL/LTR layouts.

Read [architecture](docs/architecture/system.md), [authorization](docs/security/authorization.md), [accounting invariants](docs/accounting/accounting-core.md), [decision register](docs/decisions/decision-register.md), [UX foundation](docs/ux/design-foundation.md), and [current readiness](docs/validation/implementation-status.md) and [executed verification evidence](docs/validation/execution-evidence.md).

## Verification and release caveats

`pnpm run verify` covers the backend and tools. `pnpm run web:check` and `pnpm run web:build` must pass on a connected machine, followed by Playwright acceptance, Persian RTL/accessibility, Node 24/26, and Windows/macOS validation. Do **not** treat passing backend tests as browser or statutory/accounting certification. Full FX settlement, valued inventory, comprehensive refunds, tax posting, fiscal close, and unrestricted autonomous multi-action planning remain later work. Persistent AI conversations and compound commands have scripted backend tests, but still need live-provider/browser acceptance. See the [release acceptance matrix](docs/validation/release-acceptance.md).
