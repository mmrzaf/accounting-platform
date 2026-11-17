# Milestone 5 — execution evidence (2026-11-17)

This file reports **what actually ran**, not intended checks. The code was verified from a fresh local Git clone. The local environment has Node **22.16.0**, the globally available TypeScript **5.8.3**, and Node type declarations from an available local tool installation. The published root pnpm dependencies, Node 24, React and Playwright were **not** installed here.

| Verification | Observed result |
|---|---|
| Node built-in test runner against all backend/infrastructure/accounting/trading/AI/server/web-helper test files | **107 passed, 0 failed** |
| `tsc -p tsconfig.json` | Passed with locally available Node typings (not a frozen-lock install) |
| `tsc -p tsconfig.build.json` | Passed with the same local toolchain |
| `scripts/check-docs.ts` | Passed, including local links |
| `scripts/check-sources.ts` | Passed; no tracked `.js`/`.mjs` source files |
| `scripts/check-boundaries.ts` | Passed |
| Disposable E2E fixture start/readiness (`/health/ready`) | HTTP 200 with `{ "ok": true }` |
| Fresh clone Git tree | Clean, no uncommitted code |
| Database baseline | Exactly **one** tracked `0001_initial.sql` migration |
| Browser TypeScript/Vite build and Playwright UI E2E | **Not run** — npm registry DNS unavailable; no installed React/Playwright dependencies |
| Live AI provider calls | **Not run** — scripted provider tests only |
| Node 24/26, Windows/macOS, TLS/LAN, accessibility, restore drill | **Not run** |

The E2E and CI source is a **test harness**, not a passing E2E result. `web/pnpm-lock.yaml` must be generated, reviewed and committed from a real registry-backed installation. The root Node typings also need alignment with Node 24. Do not falsely certify the release until [all acceptance gates](release-acceptance.md) are completed.
