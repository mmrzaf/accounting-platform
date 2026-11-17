# First-release business extensions — implemented backend contracts

These services are **framework-independent, company-scoped TypeScript backends**, not a complete UI or production deployment. They use existing authenticated sessions and RBAC. Finance remains under ledger ownership.

## Credit notes — `src/modules/trading/credits.ts`

- `createCreditNote`: draft credit against a single original invoice line, with positive integer minor-unit amount, date, reason and idempotency key.
- `postCreditNote`: within one transaction, post an inverse **partial** journal (sales: debit revenue/credit receivable; purchases: debit payable/credit expense) then mark the note posted.
- `reverseCreditNote`: independent immutable journal reversal and audited status change.
- `voidCreditNote`, `getCreditNote`, `listCreditNotes`; invoice projections subtract posted (not reversed) credits.
- Database triggers reject over-crediting the source line and the invoice's unallocated balance; settlement allocation checks include credited amounts.
- An invoice with active credits cannot be reversed until the credits are reversed. Already paid invoices cannot be credited through this limited workflow. **Refunds, inventory returns and tax credit-note rules are NOT implemented.** Do not use this operation as a legally valid Iranian tax-authority credit note.

## Reports — `src/modules/reports/service.ts`

- `profitAndLoss(from, through)` computes revenue and expense movements from **posted journal lines** during the selected ISO-date interval, using BigInt and canonical integer-string totals.
- `balanceSheet(through?)` is a reconciled projection using the existing ledger `financialSummary` (not a full statutory statement).
- `invoiceAging({kind})` groups current, unallocated, uncredited invoices by **age since invoice issue date** into 0–30, 31–60, 61–90 and 90+ day buckets. It is **not overdue aging**: invoice due dates do not yet exist. It is current-time-only; historical as-of allocations/reversals cannot be reconstructed exactly from the present schema. Over 5,000 invoices it fails explicitly rather than returning an incomplete total.

## Dated tax codes — `src/modules/tax/service.ts`

- Append-only tax-code versions by company, effective date, name and rate in integer parts-per-million (100,000 means 10%).
- Date-resolved lookup and pure half-even tax quotation in integer minor units. Existing invoice posting does **not** calculate or post taxes. Rate changes never rewrite prior versions.
- Not tax-law compliance; tax codes require financial/legal review before integrating into invoicing.

## Optional quantity-only stock — `src/modules/inventory/service.ts`

- Company-scoped SKU, name, unit, active/archive; in/out movements are immutable, chronological, idempotent and prohibit negative stock. Unit quantities are stored as thousandths; no floats.
- Stock totals are derived from the append-only movement ledger, not a mutable balance cache. SQLite triggers independently reject negative stock, backdating, and archiving positive stock.
- **NOT financially valued inventory.** No average/FIFO costing, inventory asset, cost-of-goods-sold postings, stock invoices, lots, warehouses or automatic invoice movements. Never treat the stock movement quantity as an accounting balance or auto-post cost from it. This deliberately leaves the earlier *valued-inventory* requirement open.

## Contact CSV import — `src/modules/imports/contacts.ts`

- Controlled UTF-8 CSV (`displayName,code`), RFC4180 quotes, optional BOM, 1 MiB/500-row limit.
- Same validated `createContact` use case for dry run and commit. Dry run rolls back all rows and audit entries; returned preview IDs are `null` because they are not persisted. Committed imports are all-or-nothing, batch-fingerprinted, and idempotent. Shared contacts are organization-wide, but batch keys are company-scoped and per-contact idempotency keys are derived from a hash including organization and company.
- CSV import only; Excel spreadsheets, chart-of-accounts imports, and opening balance imports remain future work. Avoid interpreting imported text as spreadsheet formulas on any future export.

## Attachments — `src/modules/documents/service.ts`

- Server-chosen local storage paths derived from authenticated UUIDs, never user filenames; UUID-scoped metadata and reference checks; fixed allowed MIME types, maximum 10 MiB, SHA-256 integrity verification on reading.
- Filesystem write precedes database metadata commit; failures are cleaned up when observed. Crash between writing the file and committing metadata may leave an orphan blob for an operator to reconcile.
- Data is covered by the complete database-and-attachments backup command. Browser upload/download HTTP routes and filesystem threat acceptance remain missing; do **not** treat this service as a finished document repository.

## Development obligations

All new financial behavior must go through `createTradingService` and `createAccountingService`; no AI, CLI, or UI adapter should bypass their permissions and transactions. `npm run verify` includes new `tests/trading/business-capabilities.test.ts` and all existing suites. The official UI/framework build, real provider interoperability, Node 24/26, Windows/macOS and browser E2E validation remain open gates.
