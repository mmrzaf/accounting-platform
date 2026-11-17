# Implemented accounting ledger — service contract

**Implementation:** `src/modules/accounting/` and checksummed migration `migrations/0003_accounting_ledger.sql`.

This is a **framework-independent, SQLite-backed general ledger**, integrated with the current invoice/payment application services, but not an end-user accounting interface. Company is the sole financial isolation boundary.

## Ownership and entry points

`createAccountingService(db)` composes the book, chart, posting and reporting use cases. All public operations take an authenticated `sessionToken` and an explicit `companyId` and check the actor's company-role grants **inside the service**. It does not expose arbitrary SQL, and UI/AI adapters must not bypass it.

- **Books:** `setupBook`, `getBook`, `addCurrency`, `listCurrencies`, `addPeriod`, `listPeriods`, `setPeriodStatus`.
- **Chart:** `createAccount`, `listAccounts`, `setAccountActive`. Accounts have immutable codes, categories, and parent relationships. Parents are non-postable; leaves are postable.
- **Journal:** `postJournal`, `getJournal`, `reverseJournal`, and `postWithinTransaction` as an internal compositional hook (manual callers cannot impersonate `trade.*` source documents).
- **Reporting:** `trialBalance`, `generalLedger`, `financialSummary`.

The public interface uses TypeScript definitions in `types.ts`. Amounts are **canonical nonnegative decimal integer strings** (e.g. `'50000000'`) in currency minor units. No JS floating-point numbers represent monetary values. `bigint` is used internally and signed SQLite `INTEGER` bounds are checked before binding. Zero-only and one-sided journal lines are invalid.

## Posting semantics

1. Validate the live session and company-scoped `accounting.post` permission.
2. Decode and validate input, source-event identity, base currency and foreign-rate snapshots.
3. In a short SQLite `BEGIN IMMEDIATE` transaction, check idempotency and source-event uniqueness, then find an **open** period covering the document date.
4. Validate active postable accounts and registered transaction currencies in the **same company**; sum both sides in exact `bigint` arithmetic.
5. Insert a staging header and immutable lines, then transition to `posted`. SQLite guards the transition with an exact custom `bigint_total` aggregate, count, active-account, period and base-currency checks.
6. Write security audit in that **same transaction**, then commit. Retry with the same idempotency key and identical normalized payload returns the original posted journal. Different payload or duplicate source-event identity is a conflict.

`postWithinTransaction` requires an existing database transaction. Purchase/sale/payment workflows update their source documents and call the protected internal posting service inside **one** transaction, not post first and update the document afterward. Do not perform slow I/O or contact an AI provider while holding a writer transaction. It does not itself start nested transactions.

## Ledger accounting and correction

- Journals, lines and source references are immutable once posted. SQLite triggers reject updates/deletes. A direct `INSERT status='posted'` cannot bypass validation.
- A correction of a **manual** posted journal uses `reverseJournal`, in an **open** period, with opposite debit/credit lines and a reference to the original. An original can be reversed once. Adjustments are new, independently traceable journal entries.
- Periods cannot overlap for the same company and can be closed/reopened with a separately authorized and audited action. Reposting into a closed period is rejected; a retry of an already-posted idempotency key remains valid.
- `generalLedger` sorts by business date and stable posting sequence, computes opening balance from earlier posted entries, then paginates with running balances.
- `trialBalance` returns each account's gross debits/credits **and** ending debit/credit balances. Trial-balance totals sum ending balances, not gross movements. `financialSummary` reconciles assets, liabilities, equity, revenue and expenses from posted lines only.

## Currency policy (current implementation)

- One configured accounting base currency and precision per company. Subsequent base-currency changes are rejected in this initial-book model.
- Registered foreign currencies have fixed minor-unit precision. A foreign journal line stores its positive transaction amount plus original currency, rational FX rate numerator/denominator, quotation date/source and exact base amount.
- Rates represent **base minor units per foreign minor unit**, expressed as an exact positive rational number. Conversion uses **round half to even** on each line; the caller must make the final journal balance exactly. No silently added balancing lines.
- Per-line values fit signed 64-bit SQLite `INTEGER`; aggregate trial balances are calculated in `bigint` and can exceed that range safely.
- IRR/Toman conversion remains a presentation concern; explicit base currency and units are required.

## Explicit limitations / future work

The trading module provides invoice-to-ledger mapping and payment allocations. The current version does **not** provide realized FX settlement differences, period-end FX revaluation, fiscal-year close/retained-earnings carry forward, tax policy, automated account templates, account reconciliations, automatic attachment-to-ledger linkage or a verified browser build. `financialSummary` is a **cumulative category reconciliation**, not a full formal balance sheet/P&L by fiscal year. The source document reference is an idempotent *opaque provenance key* until source services are implemented.

The `node:sqlite` adapter is used to run end-to-end offline tests. Its custom aggregate is installed by `openDatabase` on **every** connection. A future production database-driver replacement must preserve the posting-trigger contract or replace it with an equally strong exact DB-side mechanism, with tests. Drizzle remains unintegrated; React/TanStack Router is used as a separate SPA, not TanStack Start, and Windows/macOS/Node 24/26 validation is still pending.

## Verification

Run `npm run verify` (or `pnpm verify` on a machine with frozen dependencies installed). Tests under `tests/accounting/` cover exact sums, idempotency, rollback, immutable posting, reversals, foreign rates, closed periods, permissions and cross-company isolation, and concurrent writers across two connections. Keep negative tests whenever a boundary changes.
