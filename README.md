# Accounting Platform

**Strict TypeScript accounting and business-workflow services — not yet a browser-based or production-ready accounting application.**

A planned AI-native accounting and general trading platform for small Iranian businesses. The intended production system is a modular monolith with exact money arithmetic, enforced organization/company isolation, professional Persian/English UX, and an AI operator using the same application services as people. **Framework-independent identity, accounting, trading, and AI-assisted operation services are implemented; the TanStack Start/React application is still pending.**

## Current implementation

- Real `.ts` source files for all existing application infrastructure, services, CLI commands, experiments and tests; no `.mjs` application source.
- Strict TypeScript check over `src/`, `scripts/`, `tests/`, and `experiments/`; JavaScript compiled into ignored `dist/`.
- SQLite-backed organizations, companies, users, hashed passwords, sessions, rate limiting, company-scoped role assignments, permissions, and append-only security audit.
- Modular identity composition: bootstrap, sessions, users, companies, roles, and shared security context; one public `createIdentityService` facade.
- SQLite-backed accounting books, per-company charts, immutable journals, exact FX snapshots, period controls, reversals, trial balance, general ledger and category reconciliation. See [implemented ledger](docs/accounting/implemented-ledger.md).
- Trading services: shared contacts, purchase/sale invoice drafts and posts, base-currency receipts/disbursements, partial settlements, audited allocation reversals, retry-safe commands, company-specific internal document numbering and ledger-backed corrections. See [trading workflows](docs/domain/trading-workflows.md).
- AI module with organization-scoped encrypted provider configuration, permission-scoped business tools, audited automatic or confirmation-bound mutations, and a mock-tested OpenAI-compatible Chat Completions adapter. See [AI API](docs/api/ai-service.md).
- Framework-neutral identity **and AI** HTTP `Request`/`Response` adapters with session cookies, origin/CSRF checks, and explicit request decoding; **not yet connected to an HTTP server**.
- CLI for environment diagnostics, database migrations, backup/verify/restore, first administrator bootstrap, and local administrator recovery.
- RTL/LTR locale and design tokens plus a static visual fixture; no React screens yet.
- Accounting-invariant, integration, security and infrastructure tests; boundary checker and conventional-commit guidance.

## Node support

| Release | Policy |
|---|---|
| Node **24.x** | Primary development and deployment target |
| Node **22.16+** | Compatibility target |
| Node **26.x** | Compatibility target |

`pnpm@10.20.0` is the pinned package manager. Dependencies are pinned in `package.json` and tracked in `pnpm-lock.yaml`. **Frozen install is not verified in the offline environment**. Only Linux Node **22.16.0** was actually used for this correction; Windows, macOS, Node 24, and Node 26 require CI results before release claims.

## Get started

From a network-connected machine with the appropriate Node runtime:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm app:doctor -- --json
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm app:bootstrap -- --slug example --name "Example" --admin-username owner --admin-name "Owner"
```

The last command prompts for a password (or supports `--password-stdin`), so credentials need not appear in shell history. For review in an offline environment with the pinned TypeScript compiler and Node type definitions already available, the scripts also run through `npm run verify` without pnpm-specific behavior. See [development setup](docs/development/getting-started.md).

Other scripts: `check:types`, `check:sources`, `check:boundaries`, `check:docs`, `build`, `test`, `verify`, `db:status`, `db:check`, `app:backup`, `app:backup-verify`, `app:restore`, and `app:recover-admin`.

**No server is started by these commands.** `setup` creates directories; migrations/bootstrap are explicit. Backups protect the SQLite database only, not future attachments. The identity and AI HTTP adapters are not production network listeners or a production authentication deployment.

## Architecture and code ownership

- [System architecture](docs/architecture/system.md)
- [Module responsibilities](docs/architecture/modules.md) and [current code boundaries](docs/development/module-boundaries.md)
- [Implemented ledger API and limitations](docs/accounting/implemented-ledger.md), [accounting invariants](docs/accounting/accounting-core.md) and [money/FX policy](docs/accounting/money-and-fx.md)
- [Authorization](docs/security/authorization.md), [identity HTTP contract](docs/api/identity.md), [trading service contract](docs/api/trading-service.md), and [AI operations/HTTP contract](docs/api/ai-service.md)
- [Operation and recovery guidance](docs/operations/identity-bootstrap.md)
- [Architecture decision register](docs/decisions/decision-register.md)
- [Commit conventions](docs/development/commit-conventions.md)
- [Reconstruction validation record](docs/validation/typescript-reconstruction.md) and [AI validation](docs/validation/phase-6.md)
- [Next integration gates](docs/validation/next-stack-validation.md)

## Explicit non-goals and unresolved work

The TypeScript reconstruction and Phase 4–5 establish independently tested service boundaries; they **do not** introduce TanStack Start, React, Drizzle, a running server, a user-visible invoice/payment UI, or an integrated AI UI. A backend AI execution service exists, but no actual hosted or local model provider has been validated. Purchase/sale and settlement source-document **backend services are implemented**, but they are not a finished financial product. Adding production dependencies and passing frozen-install, Node compatibility, real browser and security tests remains a prerequisite before a business release. The SQLite identity services currently access the database through centralized typed SQL-projection casts; those casts need stronger schema-backed mapping when production persistence integration is established.

The company model, some detailed FX rules, inventory valuation and the final AI execution risk thresholds remain documented as proposed/pending, not silently approved. See the decision register. Any subsequent financial work must preserve double entry, postings/reversals, isolation and authorization invariants.
