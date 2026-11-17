# Product scope and success criteria

**Status:** Product scope baseline; delivered features and gaps are tracked in [implementation status](validation/implementation-status.md).

## Product identity

An accounting-led, AI-native business management product for small Iranian trading and service businesses, usable entirely without AI. This is not a currency exchange, manufacturing ERP, or heavy warehousing system. Primary users are owners, operations staff, and accountants with different information-density needs.

## First useful release

- Configuration: companies, users, company roles, fiscal year, base currency, account template.
- Accounting: chart of accounts, double-entry journals, posting/reversal, manual entries, balanced ledger, period controls, audit history.
- Daily work: contacts/parties, goods/services, sales and purchases, credit and cash invoices, partial payments, advances and refunds.
- Optional simple inventory: single location, quantity and financial valuation, initially moving weighted-average cost (pending confirmation).
- Essential reports: general ledger, trial balance, P&L, balance sheet, receivable/payable aging, cash/bank views.
- AI: retrieve/interpret records and, with authorization and policy checks, perform safe validated operations with selective confirmation.
- Persian/English, RTL/LTR, Jalali/Gregorian presentation, precise IRR/Toman interpretation and currency-agnostic accounting.

## Explicit exclusions for release 1

Manufacturing, advanced warehouses, payroll, intercompany consolidation, bank money movement, offline synchronization, automated tax filing, complex procurement approvals, public self-registration, social features, cloud multi-region infrastructure, microservices, and general-purpose workflow builders.

## Workload and environment

Small installation: one local server, usually 1–2 independent companies and <5 total users; local disk SQLite; LAN browsers; no internet needed except optionally external AI. No artificially low software limits on company count or user count. Company separation is strict from day one.

## First three acceptance journeys

1. **Ordinary purchase:** Find/create supplier, issue purchase, part-pay now, post in one action when authorized, see updated payable and journal; all in Persian RTL and English LTR.
2. **Accountant correction:** Inspect posted invoice/journal; issue an appropriate reversal or credit note in an open period, preserve full traceability, verify report reconciliation.
3. **AI operation:** Natural-language purchase with partial payment, resolve existing entities, use explicit authorized command, execute idempotently, explain created records; ask only for material ambiguities. A high-risk operation requires explicit confirmation.

## Product outcomes (measure in pilot)

- An ordinary known-counterparty invoice can be saved and posted without avoidable multi-step wizard flows.
- Every posted journal reconciles and can be traced to its source.
- Authorized users can use the full core product when the AI provider is unavailable.
- A first-time user can identify drafts, posted records, balances, and corrections without specialized training.
- No cross-company read/write in the security suite, including AI and reporting paths.
- Backups can be restored into a fresh installation with attachment consistency and auditable results.

## Regulatory limitation

Iranian tax, e-invoicing, and electronic taxpayer integrations are architectural extension points, **not** compliance promises. Legal requirements must be independently researched and verified before implementation.
