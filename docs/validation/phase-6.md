# Phase 6 validation — AI-native business operations

## Scope implemented

- Checksummed migration `0005_ai_operations.sql`: organization provider configuration, company policy, idempotent user turns, scoped action previews, tamper-resistant action identity, and backfilled system-role permissions.
- AES-256-GCM protected provider API keys (organization-bound AAD) and redacted configuration reads. Operator-managed 32-byte master key required.
- Fetch-based OpenAI-compatible Chat Completions adapter with bounded parsing, timeouts, capability switch, and no arbitrary provider output-as-SQL mechanism.
- Read tools for contacts/accounts/invoices/payments; mutation tools for contacts, draft invoices, draft payments, posting, and settlement allocations.
- Company-scoped and user-specific access, permission-filtered tool advertising, explicit per-request auto/review control, company policy gates, durable review actions, expiration, and audit entries.
- Outer action transaction with nested savepoints composes identity/trading/accounting service transactions into all-or-nothing financial execution.
- Authentication/CSRF/same-origin/HTTPS enforcing HTTP adapter ready to mount in a real server; shared HTTP security primitives reused by identity.

## Checks

Run `npm run verify` to execute strict repo-wide TypeScript checking, source/boundary/documentation checks, compiled TS build and all test suites including `tests/ai/`.

Local test coverage includes: encrypted credentials and redacted retrieval, proper accounting-context tool prompts, read tools, tool-call responses, duplicate requests, one-time financial posting, cancellation/rejection, expiration, auto-post policy, read-only role filtering, cross-company/cross-organization denial, malformed model arguments, atomic rollback on invalid financial operations, no-tool endpoints, disabled provider, and HTTP origin/CSRF/TLS checks.

No real LLM endpoint was contacted. Node 22.16 on Linux was used locally. Node 24 (primary), Node 26, Windows and macOS remain compatibility targets rather than observed results. Production dependency installation, the actual TanStack Start build, React UI, Drizzle, live model capability testing, browser E2E, and deployment/security certification are still **open**.

## Operational caveats

No production HTTP listener is included; the adapter is intentionally framework-neutral. Provider credentials require a persistent master key that must be backed up separately. The SQLite-only backup includes encrypted keys, user turns and action records, but not the decryption key. Failed network calls are not automatically retried to avoid ambiguous effects. A stranded `processing` turn must be reconciled instead of blindly replayed. No model output is trusted as a verified financial event.

### Observed local result (2026-11-17)

`npm run verify` completed on **Linux / Node 22.16.0**: **87/87 tests passed**, zero failures. This includes the 17 new AI service/HTTP tests and the unchanged financial and identity regression suites; strict TypeScript, emitted build, documentation, source extension, and dependency-boundary checks passed. Runtime and browser matrices were not run.
