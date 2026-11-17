# Development setup

Read [START-HERE](../../START-HERE.md) and [AGENTS](../../AGENTS.md). Install Node 24 and pnpm 10.20.0 with your existing package manager; **Corepack is not required**.

```sh
pnpm install --frozen-lockfile
pnpm --dir web install --no-frozen-lockfile   # generate the missing web lockfile once
# Review and commit web/pnpm-lock.yaml; use --frozen-lockfile thereafter
pnpm run verify
pnpm run web:check
pnpm run web:build
pnpm --dir web exec playwright install chromium
pnpm run web:e2e
```

The browser E2E harness uses a disposable SQLite database and a production-built client. Run `node --experimental-strip-types scripts/handoff-check.ts --json` before installation to see local release blockers. For a normal test installation, use `pnpm run setup`, `pnpm run db:migrate`, `pnpm run app:bootstrap` and `pnpm run app:serve`. See [release runbook](../operations/release-runbook.md).

The backend uses Node's built-in `node:sqlite`, with exact BigInt read modes and SQLite triggers. There is no installed Drizzle or `better-sqlite3` driver to validate, and neither should be silently introduced without a recorded design decision.
