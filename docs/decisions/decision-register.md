# Architecture decision register

This is the source of truth for decision **status**. `CONFIRMED` means explicitly stated or accepted by the user; `PROPOSED` means our preferred design; `PENDING` requires a decision before committing irreversible data structures. Proposals are not implicitly user-approved.

| ID | Subject | Decision / working approach | Status | Implication |
|---|---|---|---|---|
| D-01 | Scope | Accounting/trading for small Iranian business; not heavy ERP | CONFIRMED | Optimized for simple daily workflows |
| D-02 | Users | One organization per user; users have multiple roles; no direct user permissions | CONFIRMED | Server-side RBAC |
| D-03 | Initial scale | Approx. 1–2 organizations, fewer than 5 users total | CONFIRMED | No distributed infrastructure; avoid hard caps |
| D-04 | Organizations | Shared SQLite database, strict isolation; no public registration | CONFIRMED | Scoped keys and queries; CLI bootstrap |
| D-05 | Companies | Organization may contain multiple companies; bootstrap creates one | IMPLEMENTED-PROVISIONAL | Schema supports multiples; **user-facing decision pending**; provisional per-company ledger implemented |
| D-06 | Posting | Draft financial document does not affect ledger; post on finalization | CONFIRMED | Transactional posting boundary |
| D-07 | Approval | Configurable; authorized routine actions must avoid friction | CONFIRMED | Direct post when approval not required |
| D-08 | Audit | Posted journals immutable; use reversals/adjustments | CONFIRMED | Append-only financial history |
| D-09 | AI | High autonomy; may perform validated routine operations with scoped permissions | CONFIRMED | Policy-based execution instead of chat-only previews |
| D-10 | AI risk | Confirm destructive/high-impact actions; do not require confirmation for all routine postings | PROPOSED | Explicit risk policy and execution audit |
| D-11 | Framework | React/TanStack Router SPA + Vite with existing Node HTTP server; SQLite directly | IMPLEMENTED-PARTIAL | ADR-0008; real browser build/E2E pending; Drizzle not integrated |
| D-12 | Database driver | `node:sqlite` in current production-path code | IMPLEMENTED-PARTIAL | Exact SQL aggregate and triggers tested on Node 22; Node 24/26 and Windows/macOS pending |
| D-13 | Accounting books | One primary ledger per company, base currency and fiscal periods | IMPLEMENTED-PROVISIONAL | Accounting service built; user-facing multi-company semantics still require signoff |
| D-14 | Currency model | Exact int64 minor units, rational FX snapshots, half-even conversion | IMPLEMENTED-PARTIAL | Realized differences, revaluation and source-document currency logic pending |
| D-15 | Chart of accounts | Editable per-company hierarchy with starter template | PROPOSED | Must preserve historical references |
| D-16 | Party model | Organization-wide contact identity, company-specific account relationships | IMPLEMENTED-PROVISIONAL | Current services and schema; user-facing policy still revisable |
| D-17 | Inventory | Optional, one location; moving weighted-average valuation | PENDING | Requires financial postings/COGS contract |
| D-18 | Authentication | Local credentials, scrypt hashing, opaque sessions and local operator recovery | IMPLEMENTED-PARTIAL | Node HTTP identity adapter implemented; browser acceptance not completed |
| D-19 | Company permissions | Role grants scoped to organization or to explicit company | IMPLEMENTED-PROVISIONAL | Backend enforces scope; final user-facing company access semantics still require approval |
| D-20 | Locales | Persian/English, RTL/LTR, Jalali/Gregorian display, IRR/Toman conventions | CONFIRMED | Localization from first UI workflow |
| D-21 | Operations | Local Node server, LAN mode, consistent backups/restore | CONFIRMED | Local SQLite and attachment storage; a complete backup bundle is implemented |
| D-22 | Integration | Iranian fiscal/tax integrations later and only with verified regulations | CONFIRMED | Stable extension points, no unsupported claims |
| D-23 | Runtime | Node.js **24 primary**, support **22.16+ and 26** | CONFIRMED | Node 22.16 tested locally; Node 24/26 and OS matrix pending |
| D-24 | Phase delivery contract | Clean Git commits and full repository archives after each authorized phase | CONFIRMED | Preserve full `.git` history and clean working tree |
| D-25 | Recovery contract | One consistent database-and-attachments bundle; no public SQLite-only backup route | IMPLEMENTED-UNVERIFIED | Complete bundle has automated backup and restore tests; real operational disaster recovery drill remains |
| D-26 | HTTP boundary | Loopback Node HTTP API with authenticated service composition; reverse-proxy HTTPS for LAN | IMPLEMENTED-PARTIAL | Browser source and extension routes exist; browser build and TLS acceptance remain open |
| D-27 | Persistence boundary | Current Node SQLite service queries with unchecked row assertions | KNOWN-DEBT | Replace with schema-validated/Drizzle projections before production release |
| D-28 | Trading workflow | Base-currency non-stock invoices, payments/receipts, append-only allocations, controlled reversals | IMPLEMENTED-PARTIAL | Core backend tested; browser E2E, FX, comprehensive returns and automatic tax posting remain |
| D-29 | AI operations (initial subset) | Permission-filtered tools, per-company autonomy policy, durable approval, encrypted org provider config | IMPLEMENTED-PARTIAL | Single-turn, one mutation max; Mock-tested backend and HTTP; React assistant source exists but no browser build/live provider/compound workflows |

## Approval required before irreversible domain schema and financial features

- D-05/D-13: multi-company storage is implemented provisionally, but confirm user-facing semantics, books and company selector before financial development.
- D-19: a global role's grants cover all companies or only company-independent actions? Recommend global organization admin privileges and explicit company memberships for accounting permissions.
- D-14: core money storage/rounding implemented; rate date selection for documents, invoice/payout currency policy, realized differences and revaluation remain to settle.
- D-17: whether financially valued inventory is necessary in first release.
- D-10: risk thresholds and approved autonomous financial commands.
- D-11/D-12: current source stack is documented in ADR-0008. Validate actual locked dependencies, production browser build, `node:sqlite` support and Node/OS matrix before release.

Record each resolution in this table and an ADR when it changes a foundational invariant.
