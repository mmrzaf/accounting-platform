# Implementation status — current handoff baseline (2026-11-17)

**Classification: development candidate; NOT approved for real business accounting.** The source contains a functioning and tested Node/SQLite backend plus an unverified React browser client. Do not interpret API tests as browser validation or financial/regulatory certification.

## Implemented and tested locally

| Capability | Evidence / boundary |
|---|---|
| Identity and access | Organizations, companies, RBAC, passwords, sessions, operator bootstrap/recovery; real SQLite and HTTP tests |
| Accounting core | Exact integer minor units, company books, periods, accounts, double-entry posting, immutability, reversals, trial balance and ledger tests |
| Trading | Contacts, non-stock purchase/sale invoices, receipts/payments, partial allocations, restricted credit notes; accounting integration tests |
| Extensions | Quantity-only inventory, dated tax codes, CSV contact imports, attachments with checksums; HTTP/API tests |
| AI backend | Encrypted provider configuration, one mutating tool per turn, per-company policy, permission filtering, auditable approvals, mock-provider tests |
| Operations | Loopback Node HTTP server, consistent SQLite+attachment backup/verify/restore, CLI, checksummed migrations, hardened request sizes and unknown-API 404 |
| Handoff | `START-HERE.md`, dependency-free `scripts/handoff-check.ts`, improved `app:doctor`, agent conventions and CI browser-build gate |

**Observed verification:** 97/97 backend tests on Linux/Node 22.16, strict TypeScript for backend/CLI/tests, source extension, dependency-boundary and docs checks. Node 24/26 and other OS results have not been observed. These tests do **not** exercise a real React bundle.

## Browser source exists, acceptance remains open

The `web/` project contains React/TanStack Router pages for sign-in (Persian and English), company selection, overview, accounts/period setup, contacts, invoices, payments/allocations, ledger, quantity stock, AI requests/approvals, and organization administration. The backend serves a `web/dist` build when one exists; no such validated build is included in Git.

- `web/pnpm-lock.yaml` is **missing** because the package registry was unreachable; generate/review/commit it on a connected machine. Do not fabricate package integrity values.
- Root `@types/node` is pinned to 25 while Node 24 is the primary target; align package and root lockfile together.
- The actual React typecheck, Vite production build, browser E2E, accessibility, RTL/LTR visual testing, date input/Jalali behavior and deployment are **not verified**.
- The browser uses the backend HTTP services; it is not TanStack Start. See [ADR-0008](../decisions/0008-browser-client.md).

## Major functional gaps for full accounting use

- Financially valued stock, inventory COGS, automatic invoice tax posting, full credit/refund flows.
- Realized FX differences, period-end currency revaluation, formal fiscal-year close, bank reconciliation.
- Validated Iranian regulatory/tax integrations and legally compliant invoice output.
- Comprehensive report/form UX and optional safe bulk imports/exports, attachment navigation, advanced AI compound workflows.
- Drizzle is not integrated; direct SQLite row projections include unchecked assertions. Migration to a different driver requires preserving custom exact `bigint_total`, triggers and cross-company FKs.

## Production and operator gates

- Use Node 24 and connected pnpm for the **actual** locked install and browser build, then CI on Node 22/24/26 and Windows/macOS.
- Run full browser E2E and security review for cookie/CSRF, HTTPS reverse proxy, company boundaries and AI provider handling.
- Drill backup and restore on a fresh machine, including attachment integrity and post-restore ledger reconciliation; establish scheduled off-host backups and an owner for failures.
- Conduct accountant review on multi-currency, corrections, financial reports, taxes, inventory and fiscal periods. Do not enter critical data before explicit sign-off.

For the precise first-run sequence, follow [START-HERE](../../START-HERE.md). For ordered follow-up work, use [open-work](../roadmap/open-work.md).
