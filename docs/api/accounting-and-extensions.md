# Accounting and business extensions HTTP API

All routes require a live session cookie. All non-GET requests require a session CSRF token in `X-CSRF-Token` and a same-origin request. Every route takes `companyId` as a query parameter and calls a company-scoped application service, with role permissions enforced by the service. There is no unscoped company listing of private financial records.

Use ISO dates (`YYYY-MM-DD`) and **canonical decimal integer strings in minor units** for monetary amounts. Never send a JavaScript floating-point amount as financial input.

| Method | Path | Purpose |
|---|---|---|
| GET, POST | `/api/accounting/book` | Read / establish one base-currency accounting book |
| GET, POST | `/api/accounting/currencies` | List / add company currencies |
| GET, POST | `/api/accounting/periods` | List / create fiscal periods |
| POST | `/api/accounting/periods/:id/status` | Close or reopen a period |
| GET, POST | `/api/accounting/accounts` | Chart / create accounts |
| POST | `/api/accounting/accounts/:id/status` | Enable / disable account |
| GET | `/api/accounting/trial-balance` | Reconciled trial balance; optional `through` |
| GET | `/api/accounting/financial-summary` | Cumulative financial summary; optional `through` |
| GET | `/api/accounting/ledger` | General ledger; required `accountId`, optional `from`, `through`, `limit`, `offset` |
| POST | `/api/accounting/journals` | Post authorized manual journal (no document impersonation) |
| GET | `/api/accounting/journals/:id` | Journal details |
| POST | `/api/accounting/journals/:id/reverse` | Authorized reversal |
| GET, POST | `/api/inventory/items` | Read / add quantity-only stock items |
| GET | `/api/inventory/items/:id` | Item and current quantity |
| POST | `/api/inventory/items/:id/status` | Archive / activate item |
| GET, POST | `/api/inventory/items/:id/movements` | Append-only stock movement history |
| GET, POST | `/api/tax/codes` | List / create dated tax-rate versions |
| GET | `/api/tax/quote` | Calculate tax quote for `code`, `on`, `amountMinor` |
| POST | `/api/imports/contacts` | Transactional contact CSV dry-run or commit, maximum 1 MiB CSV |
| GET, POST | `/api/credit-notes` | List for `invoiceId` / create limited credit note |
| GET | `/api/credit-notes/:id` | Credit note details |
| POST | `/api/credit-notes/:id/post` | Post credit to original accounting |
| POST | `/api/credit-notes/:id/reverse` | Reverse posted credit |
| POST | `/api/credit-notes/:id/void` | Void draft credit |
| GET, POST | `/api/documents` | List attachments by `subjectType`, `subjectId`; or upload raw binary body with additional `filename` query and `Content-Type` |
| GET | `/api/documents/:id` | Authenticated, checksum-verified download |

Allowed attachment types: PDF, PNG, JPEG, or text/plain; upload limit 10 MiB. The body is binary, **not JSON**, and filenames are display names, not storage paths. The server creates its own private path. Backups must include both SQLite and attachment blobs.

Permissions are deliberately checked by the underlying services, including on every replay and posting action. Read-only roles cannot invoke mutations. Cross-company access is indistinguishable from a missing record.

**Known feature boundaries:** Tax rates are *not* automatically applied to invoices. Inventory is quantity-only and not valued. Credit notes do not implement full return/refund flows. Foreign-currency invoice settlements, statutory tax submission, and journal posting from imported bank statements are not available. Do not treat these routes as compliance certification.
