# Core workflow acceptance (developer / test agent)

Use a fresh disposable installation. Do **not** use live company data until the browser and accounting release gates pass.

## First run and identity

- Bootstrap one company and an administrator from the local CLI; log in with only username and password.
- The company name is informational and never selectable. A user cannot see or mutate another company's data, including direct API requests, AI tools and attachments.
- Verify Persian RTL and English LTR at desktop and mobile widths; tab order, focus, keyboard quick navigation, logout and narrow-screen navigation must work.

## Accounting setup

- Create a book in the company's base currency and an open fiscal period.
- Add distinct, active postable accounts: receivables (asset), payables (liability), revenue, expense and bank/cash (asset).
- Configure posting defaults **once** in Settings. Attempt invalid category assignments and receivables/cash identity; server must reject them.

## Sales and purchases

- Create a contact from the directory. Enter a multi-line sales invoice with noninteger quantity and a fractional rounding boundary. Verify the preview matches the server-posted total exactly.
- Save a draft, reopen and edit it, then post. Verify the journal and document status/number. Create another invoice using the direct-post action and ensure only one journal is created.
- Repeat with a purchase. Confirm closed periods and permission failures do not leave partial records. Verify posted lines cannot be edited or deleted; corrections use authorized reversals.

## Receipts, payments and settlement

- Record a partial customer receipt and choose the open invoice in the **same operation**. The receipt, ledger entry and allocation must commit atomically.
- Confirm outstanding invoice and unallocated payment balances; allocate a second receipt or remaining amount and verify updated balances.
- Record an unapplied advance. Allocate it later to an outstanding invoice for the same contact. Reject over-allocation and mismatched parties.
- Reverse a posted document and inspect the preserved audit/journal history.

## Ledger and reports

- Filter the trial balance to a cutoff date, select an account, inspect the chronological running balance with date-range filters and paging. Confirm opening and closing balances.
- Verify trial balance debit and credit totals match, and compare financial summary with posted records. Drafts must not affect financial reports.

## Required gates before a real pilot

- `pnpm run verify`, `pnpm run web:check`, `pnpm run web:build` and browser E2E must pass on Node 24.
- Verify access controls, CSRF, RTL visual/keyboard accessibility, attachment+database backup restoration, and financial consistency.
- Unimplemented tax posting, foreign-currency settlement and valued-stock accounting must not be presented as complete features.
