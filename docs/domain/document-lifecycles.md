# Document and settlement lifecycles

## Invoice lifecycle

`DRAFT -> POSTED` when no approval is required. Optional `DRAFT -> PENDING_APPROVAL -> POSTED`; `REJECTED` returns to editable draft. `VOIDED` is permitted only before posting. After posting, no silent editing/deletion; instead create explicit credit, debit, or reversal documents. Source document and journal posting transition must be one transaction.

## Payment lifecycle

Draft payment -> posted cash/bank movement -> allocated/unapplied amount. Allocation is a distinct record linked to payable/receivable, with currency and rate reconciliation. A single receipt can settle multiple invoices; one invoice can have multiple receipts. Advances can remain unapplied until allocation. Unapply/correct posted payments through traceable adjustment/reversal procedures.

## Source of truth

- Financial balances derive from the ledger; documents define commercial intent and status, not alternative authoritative balance accounts.
- Invoice outstanding amount is computed from posted invoice and valid allocations; caches are derived, reconcilable projections only.
- Posting creates journal entries once, via idempotent command and unique source reference.
- Cash/bank transfer between accounts records both sides together.
- A posted invoice may remain unpaid, partially paid, settled, or overpaid through an explicitly valid advance/refund path.

## Scenario: purchase + partial payment

1. Authorized user enters purchase of 20 units from existing supplier, 50 million **Toman**, paid 20 million Toman from bank; 30 million owed.
2. Currency display adapter converts Toman to canonical IRR units at the boundary if the document currency is IRR; user sees the original unit clearly. Do not treat Toman as a separate FX trading currency automatically.
3. Purchase posts expense/inventory and accounts payable; payment posts a bank decrease and payable decrease; source, journal and allocation commit consistently.
4. Retry with identical idempotency token returns the same result, not a second invoice/payment.
5. If supplier is ambiguous or invoice lacks a material classification, ask only that clarification; do not invent the account.

## Necessary variants to test

Credit terms, zero/partial/multiple payments, prepayment without invoice, return, refund, split tax lines, invoice reversal after partial settlement, FX invoice settled at a different rate, fiscal period rollover, concurrent posting from UI and AI.
