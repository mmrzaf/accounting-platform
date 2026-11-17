# Architecture decision register

The user-approved product model is authoritative. Decisions marked **implemented** describe source code; they do not imply production acceptance.

| ID | Decision | Status | Evidence / remaining work |
|---|---|---|---|
| D-01 | Accounting and trading for 1–5 user Iranian small businesses | Confirmed | No complex ERP or manufacturing |
| D-02 | Exactly **one Company** per user; permanent membership; no selector | Implemented backend | Single `company_id`, globally unique username; browser E2E pending |
| D-03 | Separate independent companies may coexist in an installation | Implemented backend | No shared contacts, roles, ledger or AI credentials |
| D-04 | One SQLite initial migration; no migration of unused prototypes | Confirmed and implemented | `migrations/0001_initial.sql`; use new numbered migrations only after first real deployment |
| D-05 | Server-side company RBAC, multiple roles, no direct user grants | Implemented backend | Test cross-company and privilege escalation |
| D-06 | Exact money, balanced double entry, immutable posted journals, reversals | Implemented core | Additional financial capabilities pending |
| D-07 | Drafts do not post; routine authorized work uses single final action | Implemented in business commands | UI and browser acceptance pending |
| D-08 | Configurable accounting base currency and fiscal periods | Implemented core | Realized FX, revaluation and formal closing pending |
| D-09 | Posting defaults avoid manual account selection on every document | Implemented core and UI source | Must be configured once per company |
| D-10 | Manual and AI actions share validated business services | Implemented for supported subset | Contextual conversations and atomic trade-plus-payment source added; acceptance pending |
| D-11 | React + TanStack Router + Vite SPA, served by Node HTTP API | Implemented source, unverified browser | `web` dependency lockfile and browser build/E2E acceptance pending |
| D-12 | Node 24 primary, Node 22.16+ and 26 compatibility | Confirmed | Only Linux/Node 22.16 locally verified |
| D-13 | Local SQLite WAL, transactional migrations, DB + attachment backups | Implemented backend | Real restore drill and multi-OS acceptance pending |
| D-14 | Basic optional stock is quantity-only, not valued | Implemented partial | Valuation and COGS not available |
| D-15 | Persian/English RTL/LTR and canonical persistence | Implemented partial | Jalali input and accessibility review pending |
| D-16 | AI can execute authorized routines with policy-controlled approvals | Implemented partial | Contextual user conversations, atomic composite commands and business previews in source; browser/provider validation pending |
| D-17 | Iranian regulatory integration only after legal verification | Confirmed | No compliance claim yet |
| D-18 | Strict TypeScript, agent-ready repository, focused conventional commits | Implemented tooling | Browser compilation is independent release gate |

## Decisions still requiring domain work

- Full multi-currency source documents and settlement valuation.
- Tax computation/posting, credit notes/refunds and inventory valuation.
- Closing and bank reconciliation policies.
- AI execution policies for compound operations, failures and reviews.

See [implementation status](../validation/implementation-status.md), [release gates](../validation/release-gates.md), and [open work](../roadmap/open-work.md).
