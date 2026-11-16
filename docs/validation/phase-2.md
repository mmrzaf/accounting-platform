> **Historical snapshot:** This file describes the earlier phase-2 delivery. The corrected all-TypeScript repository, current lockfile and verification evidence are described in [TypeScript reconstruction](typescript-reconstruction.md).

# Phase 2 — engineering foundation evidence

- **Date:** 2026-11-17.
- **Status:** **PARTIAL ENGINEERING FOUNDATION**. Offline infrastructure, TypeScript contracts, locale primitives, tests, CLI and CI recipe are implemented; full TanStack Start/Drizzle/shadcn build, dependency locking and runtime matrix are NOT validated.
- **Primary runtime policy:** Node.js **24**. Compatibility target: **22.16+ and 26**. The local environment only has Node **22.16.0**.
- **Prior work:** Phase 0 and Phase 1 commits preserved; no release history rewritten.

## Shipped source

1. Configuration and Node-version checks, environment loading and safe loopback defaults.
2. Allowlisted structured JSON logger (no arbitrary payloads).
3. Built-in SQLite adapter for *administrative tooling*, with foreign keys/WAL/busy timeout and health inspection.
4. Ordered, checksum-verified, transactional SQL migration engine; one infrastructure-only migration; no financial data model.
5. Safe offline CLI: setup, doctor, migrate/status/check, snapshot/verify/new-path restore.
6. Exact BigInt-safe display and Persian/Jalali/Gregorian presentation utilities; neutral CSS tokens and RTL/LTR browser fixture.
7. Strict TypeScript shared contracts, syntax/document checks, regression tests and platform-matrix GitHub Actions configuration.
8. Standardized docs and agent completion rules.

## Evidence and unresolved gates

Run `npm run verify` and the CLI smoke sequence described in `docs/development/getting-started.md`. Local pass evidence and exact test counts are recorded in the commit/phase delivery message rather than predicted here.

**Blocked externally:** no registry DNS resolution, no usable pnpm download, no Node 24/26 runtime on this machine, no Windows/macOS runners, no TanStack Start/Drizzle dependencies, no frozen-lockfile installation or real production Start build. This means **the full Phase 2 exit gate remains open**, despite meaningful executable foundation progress. `pnpm-lock.yaml` is a dependency-free starter and has not been validated using pnpm here. CI is configured, not executed.

## Next external validation checkpoint

1. Install Node 24 and pnpm on a connected host; run frozen install and quality matrix on 22.16+, 24 and 26.
2. Add TanStack Start/React/Vite/Drizzle/SQLite driver dependencies, generate and commit a genuine locked dependency graph with pnpm; remove temporary global TypeScript installation.
3. Run an actual production SSR build and server; test auth/security boundaries, generated client bundle for server secret leakage, LAN TLS configuration, and database driver packaging.
4. Replace exploratory UI fixture with tested React components, and implement proper backup coordination once file attachments exist.
5. Do not begin financial features before recording the above evidence and resolving critical `PENDING` architecture decisions.
