# Open work — ordered release backlog

1. **Browser integration gate:** Resolve and commit `web/pnpm-lock.yaml` on a connected machine. Run `pnpm run web:check`, `pnpm run web:build`, and actual desktop/mobile browser E2E. Fix all TypeScript and interaction defects before shipping.
2. **Workflow acceptance:** Test full first-use journey: CLI company bootstrap, book/period/chart setup, posting defaults, contact, multi-line invoice, immediate payment and partial settlement, reversal, ledger and report reconciliation. Verify both Persian RTL and English LTR with keyboard navigation.
3. **Product-quality UX:** Improve the new print-ready invoices and trial-balance CSV, contextual document navigation, richer reports and safe correction screens. Remove technical account selectors from ordinary workflows; keep advanced accountant controls accessible.
4. **Financial gaps:** Complete returns/refunds, bank reconciliation, full FX settlements/revaluation, fiscal closing, tax journal posting and inventory valuation/COGS—or explicitly disable unfinished operations for the first release.
5. **AI release gate:** Source now supports persistent user-owned conversations, current-record context, safe previews and an atomic invoice-plus-payment command. Verify real-provider tool calling, currency interpretation, no duplicate writes, stalled-turn recovery, message retention/privacy, permitted scope, UX and live-provider certification. General autonomous multi-action planning remains excluded.
6. **Operational certification:** Validate Node 24 first, then 22.16+ and 26 on Linux/Windows/macOS; run disaster recovery drills and audit sessions, permissions, CSRF, TLS and all business invariants.
7. **Persistence debt:** Decide whether to adopt Drizzle for schema-safe projections; replace unchecked SQL projection casts without compromising SQLite triggers and exact money arithmetic.

There are **no legacy migration or compatibility deliverables**. The current product has one initial schema and no production data. Do not claim financial production readiness until explicit acceptance gates pass.
