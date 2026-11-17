# Trading application-service contract

**Code:** `src/modules/trading/service.ts`, `types.ts`; **migration:** `0004_trade_operations.sql`.

Call `createTradingService(db)` through a trusted server/CLI/AI adapter after constructing a database connection with `openDatabase` and applying migrations. Every input includes `sessionToken` and `companyId`; no public method accepts `companyId`. Transport layers must not expose session tokens in public logs or forward unvalidated model-generated arguments directly.

| Domain | Public operations | Authorization |
|---|---|---|
| Contacts | `createContact`, `getContact`, `listContacts`, `renameContact`, `setContactStatus` | `contacts.read/manage` |
| Invoices | `createInvoice`, `reviseInvoice`, `getInvoice`, `listInvoices`, `postInvoice`, `voidInvoice`, `reverseInvoice` | `sales.read/manage`, `purchasing.read/manage`, `accounting.post/reverse` for posting/correction |
| Payments | `createPayment`, `getPayment`, `listPayments`, `postPayment`, `voidPayment`, `reversePayment` | `payments.read/manage`, `accounting.post/reverse` for posting/correction |
| Settlements | `allocatePayment`, `reverseAllocation`, `listAllocations` | `payments.manage/read` |

## Input conventions

- Public IDs are UUID strings, dates ISO `YYYY-MM-DD`, amounts positive canonical integer strings in **base currency minor units**, e.g. `'50000000'`. Invoice lines contain `itemKind`, `description`, `quantity` (decimal string with up to 3 places), `unitPriceMinor`, and a revenue/expense `accountId`.
- Invoice inputs require `kind`, `partyId`, `issuedOn`, `controlAccountId`, `description`, 1–100 lines, and stable `requestKey`.
- Payment inputs require `kind`, `partyId`, `paidOn`, `controlAccountId`, `bankAccountId`, `amountMinor`, `description`, stable `requestKey`; `reference` is optional.
- Posting takes `{ sessionToken, companyId, id }`, finalizes with a company-specific internal number, and returns a linked `journalId` plus `replayed`. No separate confirmation action is imposed by the service; a future UI/AI policy adapter may require authorization/approval before invoking it.
- Reversal takes `{ sessionToken, companyId, id, reversedOn, reason, requestKey }` and posts reversing journal entries. Reversal idempotency keys are replay-safe.
- Allocation takes `{ sessionToken, companyId, invoiceId, paymentId, amountMinor, requestKey }`. Allocation reversal takes `{ sessionToken, companyId, allocationId, reason, requestKey }`.
- Results include source totals, status, identifiers, posted number, journal references, derived settlement amounts as **strings**, and invoice line details. Do not render base-currency minor units as a localized Toman amount without explicit conversion configuration.

## Error contracts and atomicity

`TradeError.code` is one of `INVALID_INPUT`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`, `AMOUNT_OUT_OF_RANGE`; accounting and identity services retain their own typed errors (`PERIOD_CLOSED`, `UNBALANCED`, `PERMISSION_DENIED`, etc.). Map errors at the HTTP boundary, never in domain code. SQLite uniqueness/FK/check/trigger exceptions are intentionally distinct from typed application errors when raw SQL bypasses service validation.

Operations are fully synchronous and use one local SQLite writer transaction; no model calls, network fetch, or file IO should happen inside that transaction. Retrying after a timeout must use the original operation ID/key. Business source journals cannot be directly posted or reversed through the public standalone accounting facade.

**No HTTP route, React component, JSON schema or AI tool contract is implemented for these functions yet.** Do not claim functional browser availability based on this service contract alone.
