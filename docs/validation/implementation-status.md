# Implementation status and static-review record

Updated 2026-11-17. This is the **current** status document; milestone-by-milestone validation snapshots remain available in Git history, not as competing specifications.

## Delivered in source

- Strict TypeScript modules for local identity/RBAC and company accounting scopes.
- SQLite migrations for journals, source documents, AI configuration, quantity stock, tax schedules, attachments, credit notes and contact imports.
- Exact integer-based monetary accounting, balanced posting, reversals, trial balance and limited financial reporting.
- Purchase/sale invoices, receipts/payments, partial allocations, and restricted credit notes.
- Bounded AI tools with company-scoped permissions and audited authorization/approval decisions.
- Loopback Node HTTP API for identity, core trading, reports and optional AI.
- Complete database-and-attachments backup, verification, and safe restore into new paths.
- Unit and integration test sources covering many of the above behaviors.

## Missing or only partially delivered

| Area | Gap and consequence |
|---|---|
| Browser UX | React/TanStack Router source now includes core Persian/English screens, but **dependencies, typecheck, production build, E2E, Jalali picker and accessibility verification remain unfinished** |
| Persistence integration | Drizzle is not integrated; SQL query results rely on a documented unchecked cast helper. Runtime schemas and typed projections are not complete |
| HTTP surface | Core accounting setup, ledger, inventory, tax, CSV imports, credit notes and attachments now have authenticated HTTP endpoints; remaining editing/refund/reporting endpoints require product design |
| Financial depth | No valued stock or COGS posting, full returns/refunds, bank reconciliation, automatic tax posting, full FX settlements and period-end revaluation, or audited year-close workflow |
| AI product | Initial AI request and approval UI exists in source but its browser build and workflow remain unverified; live-provider acceptance and atomic compound transaction commands are missing; provider calls need operational security review |
| Operational readiness | No production installer, automated backup scheduling/retention, production reverse-proxy verification, disaster-recovery drill, or measured RPO/RTO |
| Cross-platform | Node 24 primary and Node 22/26 compatibility policy are configured but not certified by execution on all target OS/runtime combinations |
| Regulatory compliance | Iranian financial and tax integrations are not established or verified; do not present the product as legally compliant |

## Static cleanup findings and decisions

- Removed the public **SQLite-only** backup route so that backups cannot silently omit attachment files. There is one complete backup format and one CLI command family.
- Consolidated backup implementation into `src/platform/backup/backups.ts`, with platform-native path-overlap checks and post-copy hash verification added during the review.
- Removed isolated feasibility prototypes, static UX mockup, and unused shared type examples from the working tree. Historical rationale remains in Git history; the retained tests exercise actual application modules.
- Configuration and listener now agree on loopback-only addresses; startup failure explicitly releases database resources.
- Replaced outdated milestone documentation with this status and the release-gate checklist, with no claim that the requested application is already complete.

- The pinned `@types/node@25.1.0` remains out of alignment with the Node 24 primary target; dependency/lockfile alignment is a release validation task and was not guessed at offline.

## Verification evidence and limits

The previous static cleanup did not execute its modified suite. This revision re-ran the repository verification on Linux/Node 22.16 and recorded the results in the latest readiness review. The previous cleanup was static-only; this revision includes executable backend checks. The React client was only syntax-parsed because dependency installation was unavailable. Backend verification ran on Linux Node 22.16, but the React build and complete runtime matrix have not run. Do not treat the UI or this release as certified. Do not interpret deletion of obsolete feasibility tests as an increase in test coverage.

The history contains earlier delivery commits and later focused cleanup commits under the requested Git author. The repository working tree should be clean in the delivered ZIP.
