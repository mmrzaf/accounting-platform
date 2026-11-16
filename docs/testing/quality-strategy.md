# Quality strategy and release gates

Quality is established by evidence, not by the existence of test files.

## Test pyramid

1. **Pure-domain unit/property:** double-entry balance, monetary rounding, FX, account rules, period invariants, allocation arithmetic, event lifecycle.
2. **SQLite integration:** FK/composite scopes, rollback, unique idempotency, concurrent writers, migration up/forward tests, backup/restore.
3. **Transport/service security:** session and CSRF, permission denial, cross-organization and company leakage, AI tool boundaries, secret redaction.
4. **Browser E2E:** create/post/correct invoice, payments, reporting, AI fallback, Persian RTL/English LTR, keyboard and accessibility.
5. **Platform smoke:** clean setup and production build/start on Linux, Windows and macOS, offline mode, LAN TLS, native SQLite driver.

## Definition of done for any future feature

- Documented behavior and boundary, including authorization and organization/company handling.
- Necessary migrations/constraints, indexed hot paths and rollback or recovery approach.
- Correct accounting impacts and tests (when applicable); explicit audit provenance.
- Typed contract and input validation; no duplicated domain rules in UI or AI.
- Tested empty/error/loading/retry states; keyboard, RTL and LTR behavior.
- Passing formatting, lint, TypeScript, unit/integration, security, e2e smoke and production build as applicable.
- Updated source-of-truth documentation and small reviewed changeset.

## Special requirements

Verify idempotent retries with same/different payload; parallel posting, SQLite BUSY, partial failure after journal but before source update, and crash recovery. Test aggregate overflow for large IRR values and serialization of BigInt/decimal. Audit that passwords/model keys never appear in logs or browser bundles.

## CI intent

One standard `verify` command, plus targeted fast tests. Linux CI baseline, Windows/macOS compatibility matrix, browsers Chromium/Firefox/WebKit, migration verification, security smoke, tracked performance budgets. A local probe on Node 22 is explicitly **not** certification of Node 26, native packaging, or browser E2E.
