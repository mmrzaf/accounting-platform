# Agent instructions — accounting-platform

## Non-negotiable rules

1. **TypeScript throughout.** Every application, CLI, test and experiment source must be `.ts` or `.tsx`. Never introduce `.mjs`, `.cjs`, `.js`, or `.jsx` source to bypass package availability. Generated `dist/` output is ignored.
2. All sources are typechecked together: `npm run check:types`. Do not weaken `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, or exclusions to silence failures. Unsafe casts require a justified boundary; `src/platform/database/rows.ts` is known temporary infrastructure debt.
3. Use [module ownership](docs/development/module-boundaries.md), the [decision register](docs/decisions/decision-register.md) and [accounting invariants](docs/accounting/accounting-core.md) before modifying code. `npm run check:boundaries` enforces basic import rules.
4. Current implementation includes **identity, accounting, trading document/settlement services and bounded business extensions**. An AI operations service and an unmounted AI HTTP adapter now exist. No deployed TanStack Start app, React UI, Drizzle integration, production HTTP server, or trading HTTP/UX adapter exists. Read [Phase 7 extensions](docs/domain/first-release-extensions.md), [implemented ledger](docs/accounting/implemented-ledger.md), [trading workflow invariants](docs/domain/trading-workflows.md), and [AI service contract](docs/api/ai-service.md) before changing financial or AI logic. Do not assert or simulate passing those gates.
5. Server-authorized company scope and organization scope cannot be inferred from user-supplied IDs. Transport adapters authenticate then call application services. Never make an AI or React adapter its own authorization authority.
6. AI model outputs are untrusted; never introduce privileged AI tools, log keys, bypass confirmation policy, or call financial SQL directly from model output. Do not destructively edit posted finance records or use binary floating point for monetary truth in the existing accounting engine. Every critical mutation needs explicit transaction ownership and idempotency.
7. SQLite migrations are forward-only and checksummed; never silently modify an applied migration. Operator recovery is local CLI-only and must never become an HTTP/AI tool.
8. Secrets cannot appear in logs, URLs, shell arguments or committed fixtures. Backup implementation covers SQLite only until attachment recovery exists.
9. Node 24 primary; Node 22.16+ and Node 26 are compatibility targets. Tests on one runtime do not certify the others.

## Before committing

- Run `npm run verify` (full TypeScript check, source/boundary/docs validation, compiled build, and behavioral tests).
- Add regression tests for changed behavior including denied and cross-organization cases.
- Inspect `git diff --check`, `git status --short` and relevant test output.
- Use **focused Conventional Commits**, never giant commits named `phase 1`, `phase 2`, etc. See [commit conventions](docs/development/commit-conventions.md).
- Use repository-local author: `mmrzaf <mohammr.farkhonde12@sharif.edu>`.
- Do not commit generated JavaScript, databases, `node_modules`, backups, logs or secrets.

## Pointers

- [Getting started](docs/development/getting-started.md)
- [Modules](docs/architecture/modules.md)
- [HTTP interface](docs/api/identity.md)
- [Identity recovery](docs/operations/identity-bootstrap.md)
- [Accounting ledger](docs/accounting/implemented-ledger.md)
- [Open production validation gates](docs/validation/next-stack-validation.md)
