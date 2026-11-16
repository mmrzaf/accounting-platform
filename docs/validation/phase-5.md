# Phase 5 verification record — trading services

## Implemented and locally exercised

- New checksummed `0004_trade_operations.sql` migration with organization/company foreign keys, source-document lifecycles, immutable posted invoice lines/payments, matching journal provenance, unique posting numbers, and append-only allocation reversals.
- Scoped application services for contacts, invoices, payments and settlements; exact decimal quantity rounding; atomic source+ledger posting and reversal; duplicate-operation defenses.
- Payment allocation stays separate from financial posting. Company and organization boundaries are tested alongside read-only RBAC, negative allocations, posting into closed periods, SQL-level immutability, large amount arithmetic inherited from the accounting suite, and per-document numbering rollback behavior.
- Existing Phase 4 general-ledger service remains the sole ledger posting implementation. Business document source events are rejected by standalone manual posting/reversal entry points.

## Local execution and evidence

`npm run verify` covers strict TS (all application source, tests, CLI, experiments), source checks, module-boundary checks, documentation checks, compiled build, and tests. Local execution uses Linux and Node **22.16.0**; this alone does not prove Node 24/26 or Windows/macOS compatibility.

Record the final verification summary and clean-clone result in the release notes. A `.zip` is a complete Git repository (`.git` included), not an npm package or production executable.

## Still blocked / outside this phase

The real TanStack Start/React app, Drizzle integration, frozen pnpm install, browser E2E and RTL/LTR workflows are still outstanding. They require actual package installs and supported environment runners. Phase 5 should be described as a **tested backend business-workflow milestone**, not a released application. Support for foreign-currency source documents and realized exchange gains/losses, returns/credit notes, cash/bank reconciliation, tax compliance, valued inventory, and attachments must be implemented and tested before their feature claims can be made.

### Observed local result (2026-11-17)

`npm run verify` completed successfully on **Linux / Node 22.16.0**: **70 tests passed, 0 failed**. Repository-wide `tsc` strict checking, TypeScript compilation, documentation/link checks, source-extension checks, and module import-boundary checks passed. Node 24, Node 26, Windows, macOS, browser E2E, and dependency installation were **not** executed here.
