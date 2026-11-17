# Trading HTTP API — current contracts

The server authenticates via an HttpOnly session cookie and validates same-origin requests and CSRF tokens for mutations. All resources are **company-scoped from the authenticated session**. Never send an organization slug or company selector in login requests.

1. `POST /api/auth/login` — JSON `{ "username": "...", "password": "..." }`.
2. `GET /api/auth/session` — current user, company identity and CSRF token.
3. `POST /api/auth/logout` — revoke the session.
4. `GET/POST /api/business/contacts` — directory and creation; rename/status actions are on contact IDs.
5. `GET/POST /api/business/invoices` — draft listing/creation; `/record` creates and posts in one transaction.
6. `GET/POST /api/business/payments` — draft listing/creation; `/record` creates and posts, optionally allocating to a specified invoice.
7. `POST /api/business/allocations` — allocate an existing posted payment to an outstanding invoice.
8. `GET /api/accounting/posting-defaults` and `POST /api/accounting/posting-defaults` — company posting account configuration.
9. `GET /api/accounting/trial-balance` and `/api/accounting/ledger` — posted accounting balances and movements.

Other routes are implemented in their corresponding HTTP adapters under `src/platform/http/`. The backend validates authorizations, party relationships, amounts, fiscal periods, idempotency and immutable postings. **Do not construct ledger mutations in the browser**.

Money amounts in API requests are canonical integer minor-unit strings. Dates are canonical `YYYY-MM-DD`. Browser input may be Persian-localized but is normalized before submission.
