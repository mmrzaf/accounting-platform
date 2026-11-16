# Phase 1 — technical feasibility and integration report

- **Date:** 2026-11-17
- **Overall status:** **PARTIAL VALIDATION**. Offline SQLite and TypeScript probes pass; **full TanStack Start/Drizzle and cross-platform build validation is blocked by environment limitations**. Do not treat these findings as approval for a production build.
- **Reproduction:** `npm run verify:offline` and `npm run probe:types` (TypeScript compiler installed on the runner).
- **Environment actually tested:** Linux x86_64, Node **22.16.0**, npm 10.9.2, global TypeScript 5.8.3, native SQLite 3.49.1 exposed through the Node `node:sqlite` module.
- **Missing environment:** Node 26 LTS, pnpm, package dependencies, Windows/macOS runners, interactive browser. npm registry DNS lookup fails in this container (`Could not resolve host: registry.npmjs.org`).

## Evidence matrix

| Question | Method | Result | Confidence / limitation |
|---|---|---|---|
| Is TanStack Start stable? | Official announcement dated 2026-10-13 | **Yes, 1.0 stable** | Documentation evidence only, not a production build |
| Can Start isolate server functions from browser? | Official server function docs | Describes static stub generation and server-only handling | Must still test bundle for test secret and no private imports |
| Are Start server functions independently callable? | Official docs and middleware guide | **Yes**; independent endpoint auth/CSRF required | Must test attack paths using a live build |
| Can Start deploy to local Node? | Official hosting guide | Documents Node/Nitro production output | Actual generated output not built/tested |
| Does Drizzle support SQLite drivers? | Official Drizzle docs | Lists `better-sqlite3`, `node:sqlite`, libSQL | Exact dependency/driver integration not installed |
| SQLite FK/composite scope isolation? | Executable Node SQLite test | **PASS** | Database structure only; cannot replace app-level scoped queries |
| SQLite WAL / single writer? | Real file + two connections | **PASS** writer contention behavior | No load or multi-process workload benchmark |
| Idempotent journal posting & rollback? | Test-only transaction helper | **PASS** | Not production application posting engine |
| Exact large integer read/write? | Amount above JS `MAX_SAFE_INTEGER` | **PASS with `setReadBigInts(true)`** | `number` retrieval throws on large values; money type/bounds policy pending |
| SQLite integer aggregation overflow? | `SUM` near signed 64-bit max | **Observed** integer overflow | Reporting must handle overflow and limits explicitly |
| SQLite online snapshot recovery? | `backup` and integrity/foreign-key/readback check | **PASS** | Does not prove attachment-consistent backup or crash recovery |
| Permission scope denial? | Pure simulated role-scope contract tests | **PASS** | Not integrated sessions, ORM, transport, or AI |
| Strict TS branded contracts? | `tsc` 5.8.3, noEmit | **PASS** | Compile-time only; does not enforce security at runtime |
| Node 26, native package builds | No runtime/tool access | **NOT RUN** | Production target unverified |
| TanStack/React/Drizzle integration | Package registry unavailable | **NOT RUN** | Core Phase 1 stack gate blocked |
| Windows and macOS | No OS runners | **NOT RUN** | Compatibility unverified |
| Auth/CSRF/production secret leakage | No actual application build | **NOT RUN** | Critical security gate blocked |
| Browser RTL/accessibility/E2E | No application/browser build | **NOT RUN** | Product validation deferred |

## Important finding: money and driver semantics

`node:sqlite` statements default to returning regular JavaScript numbers. In the available Node version, reading an integer larger than `Number.MAX_SAFE_INTEGER` without `setReadBigInts(true)` raises a range error. In addition, `setReadBigInts(true)` **mutates the prepared statement and returns `undefined`**; code must not chain `.setReadBigInts(true).all()`. This was found and corrected by the spike. It reinforces choosing explicit BigInt handling in persistence and API serialization, then testing equivalent behavior with `better-sqlite3` + Drizzle.

SQLite's native aggregate `SUM` can overflow signed 64-bit integer limits, even when individual ledger line values are valid. The data-model/storage decision must address ledger totals, FX rates and decimal rounding before accounting implementation. A passing type-check alone does not protect against numeric range or currency unit errors.

## Architectural conclusions

1. **Continue with TanStack Start as provisional preferred framework**, not final approval. Treat server functions as authenticated same-origin RPC endpoints with separate authorization; when customizing `src/start.ts`, configure CSRF middleware explicitly.
2. **Continue with SQLite for the stated tiny installation sizes.** Use locally hosted database, composite FK/unique constraints, short transactions, WAL and verified online backup; scope is as important as DB constraints.
3. **Test `better-sqlite3` + Drizzle on Node 26** before committing migrations or shipping. The built-in `node:sqlite` module is a feasibility instrument here and is documented as release candidate in Node 26 reference material.
4. **Keep the accounting engine independent of framework and ORM.** Test-only posting code here is deliberately not a module to import into production.
5. **Do not start Phase 2 application scaffolding until the user authorizes it** and the critical blocked stack checks are scheduled into the first implementation gate. Source specs remain proposed where decision register says so.

## Required real integration experiment (next environment with registry access)

Use current compatible packages, lock exact resolved versions with pnpm, and create a small disposable TanStack Start app strictly for integration testing. Check: build + Node production start; protected server function returning a scoped record; direct unauthorized invocation; same-origin CSRF rejection; build secret sentinel absent from client bundles; session cookie handling; Drizzle migrations, foreign key activation, BigInt-safe money roundtrip, idempotent posting transaction and simultaneous write response; local attachment download traversal denial; LAN/TLS configuration; clean Windows/macOS/Linux setup. Delete/keep disposable spike only after documenting evidence. This remains a **blocked Phase 1 criterion**, not a silently passed test.

## Acceptance decision

**Phase 1 evidence package complete within the environment; full validation gate NOT PASSED.** Commit and archive the work as a transparent, reproducible checkpoint. Retest blocked items at Phase 2 entry before application feature development.

## Official evidence consulted (2026-11-17)

- [TanStack Start 1.0 stable announcement, 2026-10-13](https://tanstack.com/blog/tanstack-start-1-0)
- [TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start middleware and CSRF](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)
- [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [TanStack Start production checklist](https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist)
- [Node.js official release schedule (26.x LTS)](https://github.com/nodejs/Release)
- [Node built-in SQLite API and status](https://nodejs.org/api/sqlite.html)
- [Drizzle SQLite driver options](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [SQLite WAL documentation](https://sqlite.org/wal.html)
- [SQLite online backup API](https://sqlite.org/backup.html)
- [SQLite foreign key constraints](https://sqlite.org/foreignkeys.html)
