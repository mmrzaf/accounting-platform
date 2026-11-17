# Start here — developer and AI coding-agent handoff

This is financial software. **Do not run the current version on live financial records.** Complete both milestone checks, remaining workflow design, browser tests, and production acceptance first.

## 1. Understand the only company boundary

**There is only Company.** A user has exactly one immutable `company_id` and one or more company roles. Login accepts **username and password**; usernames are unique throughout the installation. Company is never selected in the UI and never taken from an untrusted request as authority. Companies are created **only** by a trusted local CLI operator. The current data model is described in [ADR-0009](docs/decisions/0009-single-company-boundary.md).

Review these, in order: [AGENTS.md](AGENTS.md), [architecture](docs/architecture/modules.md), [company model](docs/domain/company-and-identity.md), [accounting](docs/accounting/accounting-core.md), and [release status](docs/validation/implementation-status.md).

## 2. Inspect first, without installing dependencies

```sh
node --version
pnpm --version
node --experimental-strip-types scripts/handoff-check.ts
```

Use Node **24** as the main development version. Node 22.16+ and 26 are compatibility targets; pnpm **10.20.0** is the pinned package manager. **Corepack is optional and not required.**

## 3. Install, validate, build

```sh
pnpm install --frozen-lockfile
pnpm --dir web install --no-frozen-lockfile
pnpm run verify
pnpm run web:check
pnpm run web:build
```

The browser lockfile is not shipped until resolved and reviewed on a machine with registry access. Commit `web/pnpm-lock.yaml` as a focused dependency commit, then use `pnpm --dir web install --frozen-lockfile` for every later install. **Never fake dependency integrity fields.** Some existing quality gates depend on the installed packages; do not suppress them.

## 4. Bootstrap a fresh, disposable installation

```sh
cp .env.example .env             # review local storage paths before use
pnpm run setup                    # 'pnpm setup' is pnpm's built-in command, NOT this script
pnpm run db:migrate
pnpm run app:bootstrap -- --name "Example Company" --admin-username owner --admin-name "Owner"
pnpm run app:doctor
pnpm run app:serve
```

The CLI prompts for the password securely; it does not accept passwords as shell arguments. Visit **http://127.0.0.1:3000** and enter username `owner` and the password. **There is no company slug, switcher, or selection screen.** In Settings, create the accounting book, fiscal period, postable accounts, and **posting defaults** (receivables, payables, revenue, expense and bank/cash) once before recording invoices or payments. See [core workflow acceptance](docs/ux/workflow-acceptance.md).

For frontend development, run `pnpm run web:dev` separately with the backend running. This uses a local Vite proxy; do not publish the dev server.

## 5. Agent engineering requirements

Use the established module boundaries. All new source is strict `.ts` / `.tsx`. Design a complete vertical workflow, including authorization, database constraints, UI states and accessibility, and accounting regression tests. There is no old-database migration pathway: this is a fresh product with one initial migration.

Run `pnpm run verify`, `pnpm run web:check`, `pnpm run web:build` and appropriate browser E2E where available. Record **actual** checks and any skipped validations. Keep documentation accurate; use focused conventional commits with author `mmrzaf <mohammr.farkhonde12@sharif.edu>`.

## 6. Current unfinished release gates

Browser build and real interaction testing after the shell redesign, fiscal close, FX settlements, valued stock, full refunds, tax journal posting, live-provider AI and multi-step agent execution, Drizzle decision, and regulatory sign-off. See [open work](docs/roadmap/open-work.md). Do not declare production-ready because an API responds successfully.
