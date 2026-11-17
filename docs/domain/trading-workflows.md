# Trading document and settlement model

**Status:** Executable framework-neutral application services implemented; no browser workflow, official fiscal invoice integration, bank transfer integration, or regulatory compliance claim.

## Scope and ownership

`src/modules/trading/` owns contacts, purchase/sale invoices, receipts/disbursements and payment allocations. All mutations use the current session and explicit legal company, within short `BEGIN IMMEDIATE` SQLite transactions. Public service entry point: `createTradingService(db)`. External callers never choose the organization ID. All posting and reversal flows use the accounting engine; trading does **not** mutate the ledger tables itself.

- Contacts are shared across one organization. A user's company-scoped `contacts.read` / `contacts.manage` role permits looking up that directory from an authorized company; the contact does not own a balance.
- Invoices, receipts, payments and allocations belong to **one company**. Internal document numbers are company- and kind-scoped, e.g., `S-000001`, `P-000001`, `R-000001`, `D-000001`, allocated only on successful posting. They are not legal/tax invoice serials.
- Invoice kinds: `sale` and `purchase`. Line kinds: `service`, `non_stock`, `good`; all are financially treated as **non-stock** in this release. No quantity-on-hand, COGS, or valuation movements occur.
- Trading document financial amounts are **base-currency minor units only**. Other currency codes and FX rate snapshots remain supported by the underlying ledger, but document-level FX settlement/revaluation is not implemented. A trading document cannot silently assume a Toman/IRR conversion.
- Invoice line quantities are canonical decimal strings, up to three decimal places. Internally, `quantityMilli` is an integer and each line's amount is `unitPriceMinor × quantityMilli / 1000`, rounded half-to-even. No binary floating-point monetary calculation occurs. Prices and source totals must be positive and fit signed SQLite int64.
- Account mapping is explicit: sale debits AR asset and credits line revenue; purchase debits line expenses and credits AP liability. Receipt debits bank asset / credits AR asset; supplier payment debits AP liability / credits bank asset. Posting validates current, postable, company-owned accounts and an open accounting period.

## Lifecycle

`draft → posted → reversed`, or `draft → voided`. Draft invoices can be revised with optimistic revision checks; posted documents and journal lines cannot be edited or deleted. Payments are created as drafts and can be posted or voided; payment draft editing is not yet provided. Posted reversals reference the original journal and are prohibited while active allocations exist. To correct an allocation, append an allocation reversal, then post the correction; neither the original allocation nor its journal provenance is erased.

Post/reverse/allocate operations are atomic and audited. Repeated posting is a safe replay. Creation, allocations, and reversals accept stable idempotency keys; reusing the key with different content fails. Contact creation offers an optional idempotency key, for AI retries and imports. Draft revision requires matching the current `revision` and is not automatically replayable after losing the response.

## Where the financial truth lives

- Invoice face values come from the immutable posted source lines, while the **general ledger** is the financial reporting source of truth.
- Payment allocations are references connecting a posted payment to one or more posted invoices; **they do not post another journal**. Unapplied receipts remain credits to AR, and unapplied supplier payments remain debits to AP. Balances and account statements come from the ledger, not the sum of allocation rows.
- `outstandingMinor` is computed from invoice face amount less active allocations, for a **posted** invoice; drafts and reversals have no open financial obligation. `unallocatedMinor` is analogously derived for posted payments. Reversed allocations are excluded using append-only reversal records.
- An allocation requires the same company, party, base currency and control account; sale ↔ receipt, purchase ↔ supplier payment. An invoice/payment cannot be overallocated. The service checks the limits, and SQLite independently rejects overallocations with exact `bigint_total` and `bigint_le` safeguards.

## Authorization and UX notes

- `contacts.manage`, `sales.manage`, `purchasing.manage`, `payments.manage` authorize corresponding drafts; posting invoices also requires `accounting.post`, and posted reversals require `accounting.reverse`. This is **current policy**, not an approval-workflow engine. An administrator with both rights posts in one action; a restricted role can create drafts for another authorized user to finalize.
- `company-admin` is granted all current company permissions; existing roles and future role installations are updated by the migration. No direct user-level permission grants.
- **Recording** a payment is not a bank transfer. No money movement occurs outside the accounting system.

## Deliberate limitations

No tax calculation/invoicing, Iranian tax-authority integration, automatic account defaults, detailed product catalogue, valued inventory, stock movements, formal credit notes, refund workflow, automatic bank reconciliation, shipping, discount policy, advances netted against different control accounts, foreign-currency operational documents, or a React/Start interface. Multi-company consolidation is not provided. These features should not be inferred from the existing storage model.
