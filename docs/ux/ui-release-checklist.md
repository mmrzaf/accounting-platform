# Financial workspace UX release acceptance

This checklist describes **observable behavior**, not a claim that browsers were tested. This is a local-first financial product: verify actual screenshots and interactions before production use.

## Brand and navigation

- Company name is informational, never a selector. Login is username/password only; no tenant or organization concept is exposed.
- The sidebar is stable, navigation groups are recognizable, current location is clear, and there is no blank primary action in the header.
- `Ctrl+K` opens page navigation; Escape closes it. Test keyboard focus and mobile navigation.
- Locale changes maintain coherent direction, labels, numeric columns, and document details.

## First run and dashboard

- On a fresh installation, Overview shows guided book, account-chart and fiscal-period setup instead of raw API errors.
- Setup does not create financial journals. Verify successful setup against real API data; do not invent balance figures.
- Populated overview totals reconcile with posted journals. Open invoices link to the correct invoice records.
- Accounts without accounting-read permission should not be told to configure accounting.

## Financial workflows

- Contact list, invoice register, payment register, inventory catalogue and ledger have useful empty, loading and error states.
- Create a contact and post a multi-line invoice; confirm balances and debt allocation against the ledger. Revise draft and reverse posted items using the existing audited corrections.
- Forms keep monetary values exact, without Javascript floating-point persistence; invoice printing remains clear on A4.
- Inventories explicitly say they are quantity-only; no stock valuation or integrated cost accounting is implied.

## AI interaction

- With server key absent, open contextual AI. It must show a clear configuration state and must not offer a broken submit action.
- With key present and provider disabled, the same disabled state must appear.
- With provider configured, permitted users can see conversations, contextual record information, business previews, approval/rejection outcomes, and links to created records.
- No technical tool JSON or per-message "execute with permissions" toggle appears in the ordinary UI. Server-side RBAC and autonomy policy remain authoritative.
- Failed provider requests do not leave partial financial postings or fake completed actions.

## Release checks not performed here

- Actual browser Vite build and Playwright E2E on Node 24; persistent AI live-provider and interrupted-action tests; responsive and RTL visual inspection; screen-reader focus review; full financial and backup acceptance.
- Until these checks and the unimplemented financial capabilities are addressed, use a **disposable test company only**.
