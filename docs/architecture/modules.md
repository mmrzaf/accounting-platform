# Implemented module map

The project is a modular monolith. Responsibilities match real source directories rather than planned placeholder modules.

| Module | Owns | Depends on |
|---|---|---|
| Identity | Companies, sessions, users, RBAC, administrator recovery | SQLite, common platform primitives |
| Accounting | Books, currencies, fiscal periods, accounts, journal posting, reversals, reports | Identity and SQLite |
| Trading | Contacts, invoices, payments, settlements, credit notes | Identity and accounting |
| Reports | Ledger-derived business summaries and current invoice aging | Identity, accounting and trading |
| Inventory | Quantity-only SKU and movement records | Identity, accounting/trading references |
| Tax | Dated tax-code definitions and exact quotations | Identity, accounting/trading references |
| Imports | Transactional contact CSV import | Identity and trading |
| Documents | Attachment metadata and immutable local blobs | Identity and business references |
| AI | Provider configuration, user-owned contextual conversations, bounded tools, structured previews, approval/audit and compound service execution | Identity, accounting and trading |
| Platform | SQLite, HTTP/server composition, CLI, logging, backup and configuration | Infrastructure and explicit application-service composition |

Ownership does **not** imply that every service has an HTTP endpoint or browser screen. Manufacturing, advanced warehousing, financially valued inventory, statutory taxation, refunds, and external bank execution are not implemented. [Current status](../validation/implementation-status.md) is authoritative for delivered-vs-missing scope.

Application commands own transactions and domain validation. Accounting is the only writer of posted financial journal entries. The AI system calls these application services, never direct financial SQL. The implementation currently uses explicit SQL projections; its unchecked row casting must be resolved before a production persistence release.
