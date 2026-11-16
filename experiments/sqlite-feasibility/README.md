# Phase 1 — dependency-free feasibility probes

These probes deliberately use **Node's built-in `node:sqlite`** as an offline test instrument, not as a decision to use it in production. The preferred application database adapter remains provisional `better-sqlite3` with Drizzle, which could not be installed in this environment.

## Run

From repository root:

```sh
npm run verify:offline
```

Optional if `tsc` is available:

```sh
npm run probe:types
```

The offline verifier runs a relative-link/document consistency audit and Node native tests. Node 22.16.0 was used in the supplied environment; these tests should be repeated against the chosen Node 26 LTS build when available. `node:sqlite` produces an experimental warning on Node 22. A successful probe is not a production accounting implementation, a TanStack/Drizzle integration test, or a Windows/macOS compatibility certification.

## What is actually tested

- SQLite STRICT tables, composite FKs, organization/company containment, and CHECKs.
- Atomic source state transition/journal insert with rollback on injected failure.
- Idempotent posting request replay and conflicting key rejection.
- Exact 64-bit integer retrieval via BigInt; SQLite `SUM()` overflow limitation.
- SQLite WAL, writer contention, integrity check, and online backup snapshot.
- Isolated, **illustrative only** authorization policy denial cases.
- Branded TypeScript contracts (`probe:types`, when TypeScript compiler is available).

## What is NOT covered

Full accounting balancing at database level, live TanStack Start server/client bundling, React rendering, Drizzle migrations, `better-sqlite3` native install, auth sessions/CSRF, actual AI providers, accessibility, external provider failures, TLS, cross-platform build, attachment-consistent restore. These must become Phase 2 gates, not be assumed to pass.
