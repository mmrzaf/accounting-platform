# Release-readiness checkpoint — 2026-11-17

## Verified in this handoff pass

- The full Linux/Node 22.16 **backend suite passed 97/97 tests**, including two new handoff tests and an HTTP regression that ensures unknown `/api` routes return JSON 404 even when a built SPA exists.
- Strict TypeScript checking of backend, CLI and tests, source-extension policy, import boundaries, documentation links and backend compilation passed.
- `app:doctor` now inspects database integrity, pending migrations and browser bundle availability; `scripts/handoff-check.ts` reports actionable prerequisite gaps without requiring installed dependencies.
- The server now accounts for base64 overhead in the upload wire-body bound, while the decoded attachment limit remains enforced by the document service.
- Frontend sign-out no longer hides a server-side logout failure; English/Persian login source and current server/agent documents were improved.
- GitHub Actions now has a browser job that refuses to pass without a committed `web/pnpm-lock.yaml` and an actual Vite production build. Node 26 also provisions Corepack explicitly.

## Not verified or not implemented

- Browser pnpm lockfile, React types, real Vite build, browser E2E, keyboard/screen-reader tests and RTL/Jalali acceptance.
- Node 24/26, Windows or macOS execution and native release packaging.
- Live AI provider operation, verified TLS reverse-proxy deployment, off-host scheduled backups and disaster recovery drill.
- All complex financial workflows listed in [current implementation status](implementation-status.md), plus compliance review.

**Release decision: BLOCKED for real financial data.** This handoff is suitable for a competent developer/agent to continue on a connected machine, beginning with [START-HERE](../../START-HERE.md). A green backend suite cannot substitute for the browser, financial and operational release gates.
