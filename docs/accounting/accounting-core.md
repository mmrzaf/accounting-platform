# Accounting core — specification baseline

**Status:** Core accounting behavior is implemented and tested in the standalone service; source-document integration, fiscal-year closing and formal financial statements remain to be built. See [implemented ledger](implemented-ledger.md).

## Double-entry contract

- A posted journal entry has a stable ID, company ID, fiscal period, date, source document reference, posting actor, posting timestamp, optional reversal reference, and >= 2 lines.
- Each line references an active account valid for that company, debit or credit in base-currency **minor units**; no negative lines; disallow zero-only journals.
- Sum of debits equals sum of credits exactly in **base currency**; amounts use exact arithmetic and explicit overflow validation.
- Foreign-currency lines retain transaction amount, currency and immutable rate snapshot where necessary; converted base values still balance after rounding allocation.
- Once posted, the entry and lines are immutable. Reversals are new entries with provenance, not deletes or overwrites.
- Posting and source-document state transition are atomic. Unique source-event key and idempotency key prevent repeat posting.
- No posting to closed periods except an explicitly permitted audited reopening workflow, or adjustment into an open period per accounting policy.

## Chart of accounts

Per-company hierarchical chart with stable IDs, unique active codes in scope, account type and normal balance, optional sub-accounting dimensions. Account types drive standard statements; code alone does not determine classification. Accounts referenced by posted journals must not be deleted or repurposed destructively. Initial template adapted to local practice, not a legal compliance claim.

## Reporting contract

The trial balance is derived from **posted journal lines only**. General ledger, balance sheet and P&L reconcile against trial balance; document statistics are projections. Include period opening/closing balances without duplicating financial truth. Cross-company reports are out of v1 scope unless formally approved.

## Posting algorithm (logical, not code)

1. Authenticate actor; resolve organization and company scope from session/permissions.
2. Validate source lifecycle, dates, fiscal period, entities, account mappings, currency and permitted action.
3. Start DB transaction; obtain safe write serialization; check idempotency and unique source event.
4. Construct accounting effect deterministically; compute all amounts in exact arithmetic; validate balance and allowed accounts.
5. Insert journal header/lines and transition source state in the same transaction; record actor and audit event.
6. Commit; respond with stable posted IDs. Retry of same key returns canonical prior outcome; conflicting payload re-use is an error.

## Concurrency and correctness

SQLite has a single writer. Use short transactions and deterministic ordering. Never call an external model, network service, or slow file processing while holding a write transaction. Unique indexes enforce posting uniqueness even with simultaneous UI/AI calls. Test serialization, busy handling, transaction rollback, failed validation, duplicate commands and crash/restart behavior.

## Traceability

Journal records reference their original invoice/payment/reversal event. Changes in related company configuration are versioned where they affect interpretation. Audit events are distinct from ledger; audit logs must not become a substitute for accounting records.
