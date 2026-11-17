# Contributor and coding-agent instructions

**Start at [START-HERE.md](START-HERE.md).** Financial correctness, isolation, user experience and recoverability take priority over speed.

1. **Only one security scope: Company.** Each user belongs to one immutable company; sessions determine the scope. Never add organization/tenant entities, company switchers, login slugs or untrusted company IDs as sources of authority. Companies are created through trusted operator CLI; all other users are administered inside their company.
2. **TypeScript everywhere.** `.ts` for backend/CLI/tests, `.tsx` for React. No `.mjs` runtime modules or JavaScript source files, implicit `any` or broad unchecked casts. Keep application/domain logic independent of HTTP/React/AI.
3. **Financial invariants are mandatory.** Posted journals/lines are immutable; corrections use reversals; amounts use exact integer/BigInt arithmetic; every journal is balanced and posted transactionally; posting is idempotent. Read [accounting](docs/accounting/accounting-core.md).
4. **Authorization is server-owned.** Role permissions are company scoped, no direct user-specific permission grants. APIs and AI must call the same validated services. Add adversarial cross-company, duplicate execution and concurrency tests.
5. **Minimal, professional UI.** The source shell has grouped navigation, a noninteractive company label, username-only sign-in, keyboard navigation and responsive Persian/English layout. Extend its shared design language rather than building disconnected forms. Multi-line invoice, payment/settlement and ledger views are implemented in source but require browser acceptance. No decorative UI complexity.
6. **AI must be subordinate to business rules.** It is optional and permission-bound. The current one-mutation orchestration is insufficient for the intended full assistant; do not present it as complete.
7. **Protect secrets and backups.** No passwords, keys, session tokens, or sensitive payloads in URLs, logs, or Git. Backup includes DB and referenced attachment blobs. Run restore drills.
8. **Quality before declaring done:** `pnpm run verify`, `pnpm run web:check`, `pnpm run web:build`, browsers, RTL/LTR, accessibility and real user workflows. Be explicit about skipped gates. No fake lockfiles or assumed Node/OS support.
9. **Git:** focused Conventional Commits as `mmrzaf <mohammr.farkhonde12@sharif.edu>`, clean history, no generated artifacts or local databases tracked.

Check [architecture](docs/architecture/modules.md), [company/authorization](docs/security/authorization.md), [decision register](docs/decisions/decision-register.md), and [implementation status](docs/validation/implementation-status.md) before developing further.
