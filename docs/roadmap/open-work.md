# Remaining engineering work — acceptance order

This is the current development backlog, not a claim of completed milestones. Architecture decisions are tracked in [decision register](../decisions/decision-register.md); missing capabilities are tracked in [implementation status](../validation/implementation-status.md).

1. **Revalidate engineering baseline.** On a connected machine, run frozen installation, strict TypeScript, module-boundary, migration, accounting, HTTP and backup tests; verify Node 24 first, then Node 22.16+/26 and Windows/macOS. Align Node type definitions with the primary runtime and confirm actual API availability.
2. **Resolve persistence contract.** Integrate Drizzle or approved alternative with schema-checked SQL projections. Preserve custom `bigint_total`, triggers, cross-company foreign keys, transactions and idempotency. Eliminate the unchecked `rowsAs` assertions once verified replacements exist.
3. **Validate and complete the actual browser application.** The React/TanStack Router client has initial login, company switching, accounting setup, contacts, invoice/payment/settlement and ledger screens. Generate a frozen `web/` lockfile, typecheck and build with Vite, complete E2E, role/a11y tests, real Jalali inputs, error/correction handling and remaining incomplete administration, error handling and user flows.
4. **Close functional business gaps.** Financially valued inventory and COGS, refunds/returns, effective tax posting, full FX settlement and revaluation, bank reconciliation and closing procedures. These require domain designs and accounting invariant tests before UI exposure.
5. **Complete workflow coverage.** Inventory, tax, import, attachment and credit operations now have HTTP endpoints. Add the remaining safe edit/void/reversal, export, reconciliation and attachment navigation workflows through the same services.
6. **Certify AI and production operations.** Live provider tests, bounded compound operations and approvals, reverse-proxy security, secrets/recovery, scheduled backups, restore exercises and release sign-off.

No change is considered production-ready until its corresponding acceptance tests, platform checks and financial-domain review have been completed. The current handoff pass passed 97 backend tests on Linux/Node 22.16; browser and cross-platform gates remain open. Start with `START-HERE.md`.
