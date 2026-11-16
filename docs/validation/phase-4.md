# Standalone accounting-core validation — 2026-11-17

**Scope:** SQLite-backed and framework-independent accounting services with exact money, chart, books and periods, posting/reversals, company authorization, and ledger-only reports.

## Delivered

- Migration `0003_accounting_ledger.sql` enforces scoped foreign keys and immutable posting, prevents bypassing the staging transition, checks exact balanced totals, and records source/idempotency uniqueness.
- `src/modules/accounting/{money,validation,context,books,accounts,posting,reporting,service}.ts` separates domain responsibilities. Currency conversion uses exact rational rates and half-even rounding.
- `src/platform/database/sqlite.ts` installs the exact aggregate used by the SQLite posting trigger, on every connection.
- Company-scoped `accounting.configure`, `accounting.reverse`, and `accounting.close` permissions are seeded and registered in the identity layer.
- Integration tests in `tests/accounting/` exercise transactional posting, idempotency, double-entry equality, cumulative ledger reporting, reversed journals, permissions, closed periods, precision limits, multi-currency snapshots and SQL bypass attempts.

## Not delivered

No business document creation, settlement logic, formal fiscal-year close, FX revaluation or exchange gains/losses, React/TanStack Start/Drizzle integration, running server, AI tools or browser experience. A SQL-only accounting engine is not a complete accounting product. Production driver and Windows/macOS/Node 24/26 compatibility remain unverified in this environment.

## Validation record

The local development environment provides Linux Node 22.16 and global TypeScript. Execute `npm run verify` and record the latest output before publishing. Validate the full Git ZIP by extracting and repeating checks; do not assume archives are correct without a fresh clone test.
