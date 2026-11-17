# Operational integration checkpoint (partial Phase 8)

## Verified locally

Environment: Linux; Node 22.16; TypeScript 5.8.3. No TanStack Start, React, or Drizzle runtime packages were available via the npm registry.

Run `npm run verify` for repository-wide strict TypeScript checking, source and module-boundary checks, documentation checks, compilation and all test suites. Direct integration tests live in `tests/server/` and complete backup tests in `tests/infrastructure/complete-backups.test.ts`.

Completed checks include:

- Real loopback HTTP request/response lifecycle, login session cookie and CSRF for financial mutations.
- Company-scoped contact/invoice creation, atomic posting and ledger-backed reporting through HTTP.
- Cross-organization read/mutation denial, bad input, oversize bodies, spoofed Host and unsafe public binding rejected.
- Complete SQLite + immutable attachments snapshot, integrity and hash verification, safe two-path restoration, overwrite refusal, corruption and symlink rejection.
- Existing identity, accounting, trading, reporting and bounded AI regression tests remain passing.

## Explicitly unverified or incomplete

- **Not a completed Phase 8 production release.** No real TanStack Start/React build or client bundle, browser E2E, Drizzle integration, UI workflows, or final migration gate.
- No Node 24/26 or Windows/macOS run was performed here; the CI matrix still needs actual results.
- LAN TLS reverse proxy installation, load testing, accessibility testing, operational incident drill, backup encryption/retention, and offsite backup monitoring have not been tested.
- Full trading product gaps from Phase 7 remain, including inventory valuation, automatic tax posting, and foreign-currency settlements.
- The Node HTTP gateway is a temporary transport/validation layer, not a substitute for an integrated browser application.

## Next priority

On a connected machine: pin and install the compatible TanStack Start/React/Vite/Drizzle dependencies, validate the production build on Node 24, then implement the real Persian/English transaction UX using existing application services. Do not mark Phase 8 complete until functional browser workflows, restore drills and platform compatibility are demonstrably passing.
