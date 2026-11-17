# Start here — developer and coding-agent handoff

**Read this before making changes.** This is financial software; the current repository is a **development candidate, not a certified accounting product**. Do not enter live business records until all release gates pass and an accounting professional signs off the workflows.

## What is here

- `src/modules/`: audited TypeScript application/domain services (identity, accounting, trading, AI, reports, inventory, tax, documents).
- `src/platform/`: SQLite persistence, forward-only migrations, backup, HTTP adapters and Node server.
- `web/`: React + TanStack Router SPA, built with Vite; its package installation/build has **not yet been certified**.
- `scripts/`: TypeScript CLI, quality checks and dependency-free handoff diagnostics.
- `migrations/`: append-only checksummed SQL; never change applied migration files.
- `docs/`: the current invariants, architecture and remaining release gates.

**Source of truth:** [AGENTS.md](AGENTS.md) for coding rules, [current status](docs/validation/implementation-status.md) for gaps, [release gates](docs/validation/release-gates.md) for acceptance. Historical Git commits are not proof of release readiness.

## A. First inspection (does not modify anything)

Use Node **24** (primary). Node 22.16+ and 26 are compatibility targets. From the repository root:

```sh
node --experimental-strip-types scripts/handoff-check.ts
node --experimental-strip-types scripts/handoff-check.ts --json
```

The diagnostic is dependency-free; it reports missing dependencies, missing browser lockfile, and unbuilt UI without printing secrets. `--release --strict` exits nonzero if the release preflight is not ready.

## B. Install and freeze dependencies (requires npm registry access)

1. Enable the pinned pnpm through Corepack: `corepack enable`. **Node 26 does not bundle Corepack:** install it first with `npm install -g corepack@0.36.0` (Node 22/24 normally include it).
2. Install backend dependencies: `corepack pnpm install --frozen-lockfile`.
3. **One-time release blocker:** `web/pnpm-lock.yaml` does not yet exist. On a connected machine run `corepack pnpm --dir web install --no-frozen-lockfile`; inspect the resulting dependency tree, advisories, and versions; **commit** `web/pnpm-lock.yaml` as an isolated `chore(deps): ...` commit. Do not fabricate a lockfile or turn off frozen installs in CI.
4. Thereafter install the browser with `corepack pnpm --dir web install --frozen-lockfile`.
5. The backend currently locks `@types/node@25` while Node 24 is the primary target. Align types and regenerate the *root* lockfile in a separate reviewed dependency commit on a connected machine.

If registry access fails, stop and report the blocker. Do **not** replace React/Vite with a disposable UI or weaken the test gates to claim a successful build.

## C. Verify before developing

```sh
corepack pnpm verify             # backend: strict TS, boundaries, docs, build, behavior
corepack pnpm web:check          # frontend TypeScript (requires browser dependencies)
corepack pnpm web:build          # real Vite production bundle
node --experimental-strip-types scripts/handoff-check.ts --release --strict
```

The GitHub Actions workflow enforces a frontend build once the browser lockfile exists. Do not claim Windows/macOS/Node24/26 results until the corresponding jobs actually pass. A green backend job alone is **not** a green release.

## D. Initialize a disposable local installation

Run these commands **only after reviewing the configured database path**. The defaults use ignored `var/` directories. The administrator password is prompted privately (not a command-line argument):

```sh
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm app:bootstrap -- --slug demo --name "Demo Organization" --admin-username owner --admin-name "Owner"
corepack pnpm db:check
corepack pnpm app:doctor -- --json
corepack pnpm app:serve
```

Open `http://127.0.0.1:3000` after the browser build exists. Sign in with organization `demo` and user `owner`. In the company Settings, create the accounting book, fiscal period and a *test* chart of accounts, then create a contact, a small invoice, post it and inspect the ledger. No statutory Iranian chart of accounts or verified compliance template is shipped.

For frontend development, keep the API server running in one terminal and launch `corepack pnpm web:dev` in another. Vite serves `http://127.0.0.1:5173` with a local API proxy. **Never deploy the Vite dev server or bind it to the LAN.**

If a browser shows only `NOT_FOUND`, the production bundle is probably missing. Build `web/` first; the backend intentionally stays usable as an API.

## E. Financial and security acceptance

Before real use, verify in an isolated copy of the database: authorized company-scoped access, incorrect-company denial, invoice posting, partial payment allocation, correction/reversal, period controls, bank/cash classification, negative cases, AI approval policy, backup/restore, RTL/LTR interaction, and browser E2E with Chromium/Firefox/WebKit. Confirm posted journals balance and all account balances reconcile. The [release runbook](docs/operations/release-runbook.md) describes operational controls; it is not a certification.

For a complete backup (database plus attachments):

```sh
corepack pnpm app:backup -- --json
corepack pnpm app:backup-verify -- --source ./var/backups/NAME.bundle
```

See [recovery procedure](docs/operations/complete-backups.md) before using restore. Restore only into new paths, never into a live database or attachment directory.

## F. Agent change protocol

1. Identify the owning module and read its invariants/contracts. List the specific files and edge cases you intend to modify.
2. Keep changes in strict `.ts`/`.tsx`, with explicit service boundaries and permission enforcement. Do not add `.mjs`, compatibility wrappers, mock financial truth, or bypasses for offline package installation.
3. Add positive, negative, concurrency/idempotency and cross-company tests where applicable. Do not change an applied migration; add a numbered migration.
4. Run applicable checks, report the exact results **and any skipped gates**. Never call a syntax parse a React build.
5. Use focused Conventional Commits under `mmrzaf <mohammr.farkhonde12@sharif.edu>` only when instructed for this repository. Do not claim verification that you did not execute.
6. Keep `docs/validation/implementation-status.md` and release checklist current. Do not delete working services simply because the UI has not exposed them yet.

### Specific unresolved blockers (handle first)

- Generate, review and commit the browser lockfile; align Node type definitions and execute real Vite build and browser E2E.
- Verify the production reverse proxy + TLS/session/CSRF behavior and OS/Node compatibility matrix.
- Complete financially valued inventory, full returns/refunds, tax posting, FX settlement/revaluation, bank reconciliation, fiscal closing and regulatory verification before claiming those features.
- Review the SQL result projection casts and integrate Drizzle **only** if the accounting guarantees survive exact-money and trigger tests.

**Do not publish a production-ready claim until all blockers are resolved and documented.**
