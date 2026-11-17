# Business extensions validation record (2026-11-17)

The delivered changes are backend TypeScript modules, not a finished production release. Added checksummed migrations `0006_access_and_tax.sql` through `0010_contact_imports.sql`, with unchanged earlier migration history.

Run `npm run verify` on the extracted archive. This executes repository-wide strict TypeScript validation, imports/extension and dependency-boundary checks, documentation checks, compilation and all Node test suites. `tests/trading/business-capabilities.test.ts` covers tax schedule immutability/date resolution, stock movement invariants and direct SQL guards, transactional CSV preview/import/idempotency, P&L and invoice aging reconciliation, credit-note posting and reversal/rollback, over-allocation prevention, attachment integrity/path handling, company/organization isolation and read-only roles.

**Not completed:** TanStack Start/React application, Drizzle integration, real UI and browser journeys, comprehensive statutory financial statements, valued inventory or invoice-stock integration, approved tax calculation on invoices, refunds of settled invoices and Iranian regulatory tax integration, Excel and opening balance imports, combined attachment+database backups, full cross-platform runtime matrix, production security and external AI provider certification.

The package is not authorized for real business production until these gaps have been reviewed and the application/deployment gates have passed. Keep this evidence current when validation is rerun.
