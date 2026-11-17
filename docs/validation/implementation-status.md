# Implementation status — 2026-11-17

**Engineering candidate only. Not certified for live financial records.** This register separates implemented code from verified behavior.

## Milestone 1 — Single-company architecture

- Implemented: one `companies` table and one immutable `company_id` on users; globally unique usernames; company-only authentication, roles, sessions, audit, business records, reporting and AI configuration. No company selection or organization layer.
- Implemented: one initial migration, no old migration history or conversion scripts.
- Verified: backend TypeScript, migration, identity, isolation and accounting tests on Linux/Node 22.16. Browser and multi-platform acceptance remain open.

## Milestone 2 — Application shell and interaction foundation

- Implemented in React source: username/password login, informational company identity, grouped navigation, quick navigation, mobile drawer, Persian/English direction, focus, loading/error/empty patterns and a restrained design system.
- Not yet verified here: dependency-locked browser build, browser E2E, visual RTL review, full accessibility and keyboard acceptance.

## Milestone 3 — Business workflow experience

- Implemented backend: posting defaults (configure once), atomic invoice posting, atomic payment posting with optional invoice allocation, idempotency, rollback and financial invariants.
- Implemented in React source: multi-line invoice editor with business totals and draft lifecycle, receipt/payment editor with optional settlement and remaining allocations, searchable contact directory with detail, and account-ledger date filtering and pagination.
- Still incomplete: automated tax posting, returns/refunds, professional printed documents and exports, advanced reporting, full source-document multi-currency handling and full browser interaction verification.

## AI and release

The current AI has permission-filtered tools and policy-based approvals, but not persistent contextual conversations or multi-step compound workflow autonomy. Release still requires frozen frontend dependencies, actual browser typechecking/build and E2E, Node 24 and Windows/macOS validation, operational restore drills and financial/regulatory review.

See [remaining work](../roadmap/open-work.md) and [release gates](release-gates.md).
