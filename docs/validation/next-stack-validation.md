# Next environment validation plan (Phase 1 carryover into Phase 2 entry)

These are not completed tests. They should run **before production application release and framework integration** on a connected machine with Node 24 LTS, pnpm and OS CI access. The standalone accounting core is implemented offline but does not satisfy these gates.

## Reproducibility

1. Record exact Node `24.x` (primary), `22.16+` and `26.x` (compatibility), pnpm and npm versions; do not use floating `latest` in project manifests.
2. Select compatible current versions from official release notes, pin major/minor policy, commit `pnpm-lock.yaml`, run `pnpm install --frozen-lockfile` in CI.
3. Use a single normal `pnpm verify` for static checks, unit/integration tests, production build and security smoke. Do not require a particular shell for portable scripts.
4. Validate `better-sqlite3` native package install, prebuilt binary availability, fallback compile requirements and Node version compatibility on Windows x64, macOS (arm64/x64), and Linux x64.

## TanStack Start integration

- Use official app template and documented Vite/Nitro adapter (or reconsider if builder version has changed); install with locked dependencies.
- Build and run the actual production server (do not conflate dev success with deployment).
- Use one authenticated server function and one ordinary server route. Verify both independently enforce identity and scope.
- Test direct RPC calls without route navigation, no-cookie request, wrong-company resource, CSRF from foreign origin, and unexpected Origin headers.
- If using `src/start.ts`, verify custom middleware retains expected CSRF protections.
- Inject a harmless secret sentinel into server environment, scan client output/source maps/responses for it.
- Verify no private response is marked public-cacheable; use private/no-store appropriately.

## Drizzle/SQLite integration

- Prove chosen driver returns exact signed 64-bit values as BigInt; verify unsafe JS numbers are rejected at the application boundary. The current posting guard depends on a per-connection custom `bigint_total` SQL aggregate; verify equivalent exact database-side enforcement with the chosen production driver.
- Generate/apply migrations twice to a clean database; check FK PRAGMA every connection and partial failure rollback/migration recovery.
- Use composite `(organization_id, company_id)` references, per-company unique constraints and explicit query scoping. Prove cross-org and cross-company negative tests.
- Exercise conflicting idempotency keys, simultaneous postings, timed-out request outcome recovery, WAL checkpoint and file locking.
- Perform a hot online backup plus attachment snapshot, restore into clean workspace and reconcile balances.

## UX and access

- Establish minimal Persian RTL and English LTR page with accessible form, select, table and date input. Verify mixed numeric/currency strings under keyboard navigation.
- Test with Chromium, Firefox and WebKit; explicitly inspect mobile/narrow desktop layouts.
- Measure first invoice form and posting latency on a realistic low-cost local machine.

## Gate artifacts

Produce a machine/OS/versions evidence table, CI logs, build and test commands, bundle sentinel scan result, migration trace, screenshots of RTL/LTR workflow, and list of remaining blockers. Update ADR-0007 and the decision register only after evidence is reviewed.
