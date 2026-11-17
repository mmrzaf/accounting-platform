# Module ownership and dependency direction

The current project is one TypeScript modular monolith. Application modules have direct, explicit SQLite access where required; a hypothetical repository framework is not present. A single transport adapter does not own domain rules.

| Area | Responsibility |
|---|---|
| `src/modules/identity` | Authentication, permissions, sessions and companies |
| `src/modules/accounting` | Accounts, books, exact money, fiscal periods, journal posting and ledger projections |
| `src/modules/trading` | Contacts, invoice and payment documents, allocations, credits |
| `src/modules/{ai,inventory,tax,imports,documents,reports}` | Optional AI and focused business services built on identity/trading/accounting |
| `src/platform/database` | SQLite connections, migrations and the current SQL row-mapping boundary |
| `src/platform/http`, `src/platform/server` | Input/output transport adapters and service composition |
| `src/platform/backup`, `src/platform/config` | Consistent recovery and runtime configuration |
| `src/ui` | Independent locale formatting; no DB or domain imports |

**Actual dependency hierarchy:** identity -> accounting -> trading -> extensions/AI; platform HTTP and server may depend on application services. Neither identity nor accounting may depend on trading or AI. The boundary checker enforces these explicit dependencies at the source level.

`src/platform/database/rows.ts` is an **unchecked assertion boundary** for named SQL projections: its generic casts do not perform runtime shape validation. This is a known correctness debt. Do not call it type-safe decoding, and do not broaden its use. Replace it with schema-validated mappings or typed Drizzle projections as part of the production persistence integration; no compatibility adapter is being provided to obscure that gap.

Identity and accounting use short, explicit SQLite transactions. Trading posts journals inside the same transaction as source-document status changes; AI uses those established application services and cannot post through direct SQL. Audit mutations and idempotency are enforced in those operations. SQL migrations remain forward-only and checksummed.

Change protocol: identify the owner, update its contracts, preserve cross-company permissions, add success/failure/idempotency tests, update documentation and use focused conventional commits. Runtime and browser validation are separate release gates.
