# Code ownership and module boundaries

This repository contains an executable **foundation**, not a deployed TanStack application. Types are strictly checked across source, scripts, probes, and tests. No JavaScript sources are permitted outside compiler output in ignored `dist/`.

## Current directory map

| Directory | Ownership | Rule |
|---|---|---|
| `src/shared` | Stable primitives and cross-boundary contracts | Import no business, platform or UI code |
| `src/modules/accounting` | Book and currency configuration, company-scoped accounts, immutable posting/reversals, ledger-only reporting | Independent of HTTP/UI/AI; depends on identity actor checks and SQLite platform only |
| `src/modules/trading` | Contact directory, source documents, payments, allocations, draft revision and accounting service orchestration | No HTTP/UI/AI dependency; no direct journal writes |
| `src/modules/identity` | Use cases, policies, credentials, sessions, company access, roles | No transport-framework or UI imports |
| `src/platform/database` | SQLite connection, migrations, SQL projection boundary | No business policy |
| `src/platform/http` | Request/response adapter; authentication transport | Decode input; call services; never trust caller-supplied actor |
| `src/platform/config` | Environment and runtime policy | Never import features |
| `src/platform/backup` | Database backup/restore safety | Must not mutate accounting business rules |
| `src/ui` | CSS tokens, locale formatting, eventually React components | Presentation only; no direct persistence or identity internals |
| `scripts` | Operator commands, checks and local integration adapters | Scripts may compose public service and platform APIs |
| `tests/trading` | End-to-end source+ledger workflows, settlement correctness, permissions and correction behavior | No external model/provider dependencies |
| `tests/accounting` | Ledger domain behavior, exact currency math, permission/isolation, concurrency and rollback regressions | Never weaken invariant checks to make tests green |
| `tests/identity`, `tests/infrastructure` | Feature and infrastructure regression suites | Black-box behavior and isolation, including adversarial requests |
| `experiments` | Bounded technical probes and static UX fixture | Not production app code |

The identity facade in `src/modules/identity/service.ts` composes **bootstrap**, **sessions**, **users**, **companies**, and **roles** services; `context.ts` owns shared transaction/authorization/audit helpers. HTTP and CLI consume the public facade rather than implementing a second identity domain.

### Intended dependency direction

```
UI / HTTP / CLI / AI adapter
           ↓
     Application service
           ↓
    Domain invariants
           ↓
     Persistence port
           ↓
     SQLite / Drizzle
```

Currently, identity and accounting application code use SQLite directly via `src/platform/database/rows.ts`; its `rowAs` functions are a **controlled, unchecked cast at the persistence boundary**, not runtime SQL-result validation. This is temporary technical debt: replace with typed Drizzle projections and/or decoders when the production persistence stack is installed. Do not introduce boilerplate repository interfaces solely to hide this known limitation. Every service still enforces organization/company permissions and relies on database constraints.

`npm run check:boundaries` enforces the fundamental import directions. It is intentionally **not** a complete module dependency graph; deeper inter-module restrictions should be added when the respective modules exist.

## Change protocol

1. Identify module owner and update its public contract before callers.
2. Keep transaction and authorization policy at the application-service layer.
3. Update migrations additively; historical migration checksums cannot change.
4. Test both authorized and denied paths, invalid inputs and failure rollback.
5. Run `npm run verify` and inspect generated `dist/` only if needed; never commit it.
6. Include one focused conventional commit per independently reviewable concern (`feat(identity): ...`, `fix(http): ...`, `test(identity): ...`, `docs(architecture): ...`).
