# Strict TypeScript reconstruction — validation record

**Date:** 2026-11-17. This repository starts a new Git history with granular conventional commits. The previous JavaScript-heavy phase archives are separate and have not been silently rewritten in place.

## Scope of repair

- Converted all pre-existing application `.mjs` modules, Node CLI commands, validation probes and test suites to `.ts`.
- Extended `tsconfig.json` from selective shared-contract checking to **all** `src`, `scripts`, `tests` and `experiments`, using `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, and checked Node APIs.
- Added compilation with JavaScript output and declarations into gitignored `dist/`; no JS application code is checked into Git.
- Decomposed a monolithic identity service into context, bootstrap, sessions, users, companies and roles, accessed through a stable typed facade.
- Centralized the remaining unchecked SQLite result projections in `src/platform/database/rows.ts` and documented this as known technical debt.
- Explicitly decoded HTTP payload properties rather than spreading untrusted objects into application calls.
- Added import-boundary policy checks, renamed tests/experiments by subject, strengthened portable path handling, enabled regression checks and added a new HTTP/password-validation test.
- Revised developer documentation, CI matrix and conventional commit guidance.

## Evidence obtained locally

| Gate | Observed result |
|---|---|
| `npm run check:types` | Pass, full repository strict TypeScript |
| `npm run check:docs` | Pass, required documents and local links |
| `npm run check:sources` | Pass, no checked-in JavaScript sources in executable directories |
| `npm run check:boundaries` | Pass, currently enforced import layer rules |
| `npm run build` | Pass, emitted build and declaration files |
| `npm test` | **41/41 pass**, identity, HTTP, CLI, persistence and SQLite probes |
| Runtime used | **Linux, Node 22.16.0** |

## Unverified or incomplete

- `pnpm install --frozen-lockfile`: pinned dependency lockfile was prepared but **not install-verified**. This runner has no package registry access.
- Node 24 (primary), Node 26, Windows, macOS: CI matrix configured, **not run**.
- TanStack Start, React, Tailwind, Drizzle, production HTTP server, native SQLite driver selection and browser E2E: **not integrated**.
- Data contract projections rely on typed casts of SQLite results without runtime decoding. A production persistence adapter must improve this boundary.
- Financial accounting engine and real app UI: **not implemented**.

This is a repair of the existing foundation, **not proof of production readiness**.
