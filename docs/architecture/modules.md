# Module and dependency map

A single deployable modular monolith. Modules own behavior and their data invariants, not arbitrary table groups.

| Module | Owns | Depends on |
|---|---|---|
| Identity | Users, credentials, sessions, role assignments | Organizations, platform auth |
| Organizations & companies | Company membership, company settings, legal identity | Identity via stable actor contracts |
| Accounting | Account chart, journals, posting, periods, ledger queries, rates | Company scope, pure money primitives |
| Trading (`src/modules/trading/`) | Shared contacts, source invoices, receipts/payments, allocations and journal provenance | Identity actor + accounting reference/posting ports |
| Catalogue | General goods/services master remains unimplemented; inventory has a small company-local SKU list | Organization/company scope |
| Sales | Sales documents and credit notes, lifecycle | Parties, catalogue, accounting posting port |
| Purchasing | Purchase documents and supplier credits | Parties, catalogue, accounting posting port |
| Payments | Receipts, disbursements, allocations, refunds | Sales, purchasing, accounting posting port |
| Inventory (optional) | **Quantity-only** company items/movements; valuation unimplemented | Identity company scope |
| Reports | Ledger-derived P&L / balance summary and current invoice-age projection | Accounting, trading read projections |
| Documents | Scoped attachment metadata and local blob integrity; coordinated backup pending | Identity + company references |
| AI (`src/modules/ai/`) | Encrypted provider config, contextual model calls, constrained tools, approval and execution policy | Identity permissions + existing trading/accounting application services |
| Platform | Database, migrations, configuration, logging, backup, CLI | Infrastructure-only dependencies |

## Direction rule

Presentation and transport -> application use cases -> domain invariants and ports -> infrastructure implementations. Shared contracts are intentionally small. Domain code must not import React/TanStack, Drizzle, database driver or model SDKs. A module may not read another module's tables without a documented read interface. Phase 5 trading reads accounting-owned chart/book data through `accounting/references.ts` and posts through `accounting/posting.ts`.

## Transaction ownership

Application use cases own the transaction. Accounting is called as a local service inside the same transaction as the source-document state change and payment allocation. The AI orchestrator owns an outer action transaction and existing services use uniquely named SQLite savepoints for nested atomic work. Avoid independent commits inside an AI execution. Posting request idempotency checks and resulting entries must commit atomically.

## Suggested eventual layout (not scaffolding)

`src/modules/{accounting,sales,purchasing,payments,...}` with per-module `domain/`, `application/`, `infrastructure/`, `ui/` when warranted; `src/platform/` for persistence/security/config; `src/app/` for Start adapters; `src/shared/` for tightly constrained common primitives. No mandatory layers for tiny modules, no package-per-module by default.
