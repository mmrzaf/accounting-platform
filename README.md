# Accounting Platform

**Start with [START-HERE.md](START-HERE.md).** The source is a TypeScript modular monolith for small-business accounting with one **Company** as its only security and accounting boundary. One user belongs permanently to one company; the server resolves company ownership from the user's session. There is no company or tenant selection, including at login.

The repository contains a SQLite-backed accounting and business service, Node HTTP API, React/TanStack Router browser client, CLI, migrations, and regression tests. **Not certified for real financial use:** the redesigned browser shell requires an actual browser build/UX review; major financial and AI workflows remain incomplete.

## What exists

| Area | Implemented today |
|---|---|
| Company and access | Installation-level company bootstrap; unique usernames; users belong to one company; scoped RBAC, sessions, password recovery and audit |
| Accounting | One company ledger, chart, periods, configurable posting defaults, integer-money journals, immutable posting/reversal and reconciled ledger reporting |
| Business operations | Contacts, non-stock multi-line sales/purchases, atomic invoice/payment posting, partial allocations, restricted credit notes |
| Extensions | Quantity inventory, effective-dated tax codes, CSV contacts, company-owned attachments, selected reports |
| AI | Optional provider, permission-filtered tools, approval rules, and audit (currently limited to one mutation per turn) |
| Interface | Username/password sign-in; grouped responsive shell, bilingual RTL/LTR navigation, keyboard page switcher; multi-line invoice entry, partial settlement, contact records and date-filtered account ledger (browser acceptance pending) |
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
pnpm run setup
pnpm run db:migrate
pnpm run app:bootstrap -- --name "Example Company" --admin-username owner --admin-name "Owner"
pnpm run app:serve
```

Enter the administrator password when prompted. Visit `http://127.0.0.1:3000` and sign in with **username and password only**. The default listener is loopback-only. The browser lockfile must be reviewed and committed on a connected machine, followed by frozen installations. The web build cannot be certified in this environment. For actual machine setup, use [START-HERE](START-HERE.md).

**Important:** Use `pnpm run setup` rather than `pnpm setup`; the latter invokes pnpm's own built-in setup operation.

## Architecture and engineering

- Exact financial amounts use integer minor units and `bigint` arithmetic; journal posting is transactional and audited.
- Authentication/roles/company ownership are enforced in services and database constraints, not React.
- `src/modules` holds domain/application services; `src/platform` holds SQLite/HTTP/backup adapters; `web` is presentation only.
- `migrations/` defines the **new company-only baseline**. All future migrations must be append-only; never rewrite already-applied new-baseline migrations.
- TypeScript is strict, and the new shell uses restrained components, accessible focus states, and RTL/LTR layouts.

Read [architecture](docs/architecture/system.md), [authorization](docs/security/authorization.md), [accounting invariants](docs/accounting/accounting-core.md), [decision register](docs/decisions/decision-register.md), [UX foundation](docs/ux/design-foundation.md), and [current readiness](docs/validation/implementation-status.md).

## Verification and release caveats

`pnpm run verify` covers the backend and tools. `pnpm run web:check` and `pnpm run web:build` must pass on a connected machine, followed by browser E2E, Persian RTL/accessibility, Node 24/26, and Windows/macOS validation. Do **not** treat passing backend tests as browser or statutory/accounting certification. Full FX settlement, valued inventory, comprehensive refunds, tax posting, fiscal close, and autonomous multi-step AI remain later work.
