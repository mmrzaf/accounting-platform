# Contributor and coding-agent instructions

This repository contains financial software. Do not treat a successful compilation as proof of accounting correctness.

1. **Use TypeScript for source and tests.** Do not add JavaScript or `.mjs` source files. Generated build output belongs outside Git.
2. **Preserve the accounting invariants.** Never mutate posted journal history, use floating-point amounts as financial truth, bypass transactional posting, or accept client-provided organization identity. Read [ledger invariants](docs/accounting/accounting-core.md) before financial changes.
3. **Respect authorization at the service boundary.** Organization and company access is derived from a live session; role assignments determine permissions. AI gets no privilege of its own.
4. **Keep module ownership explicit.** Route adapters decode and validate untrusted input; modules implement use cases; persistence remains under controlled access. Read [module dependencies](docs/development/module-boundaries.md).
5. **Never modify applied migrations.** Add new migrations, verify exact-money constraints, and preserve composite organization/company database references.
6. **Handle credentials safely.** No keys, passwords, session tokens, or provider credentials in arguments, URLs, repository files, telemetry or logs. Local administrator recovery must remain CLI-only.
7. **Use only the complete backup format.** Database-only copies do not preserve attachment integrity; verify and periodically restore complete bundles. See [recovery](docs/operations/complete-backups.md).
8. **Document actual capability, not intent.** There is a Node HTTP API, but no finished React/TanStack UI, live-provider acceptance result, or production release certification. See [implementation status](docs/validation/implementation-status.md).
9. **Use focused Conventional Commits** (`feat(module): ...`, `fix(module): ...`, `refactor(module): ...`, `test(module): ...`, `docs(module): ...`). Repository author is `mmrzaf <mohammr.farkhonde12@sharif.edu>`.

Before proposing a commit, verify the precise module boundary, add targeted positive/negative/cross-company regression coverage, and normally run `pnpm verify` plus relevant platform checks. **For the current static-only cleanup, verification execution was intentionally deferred at the user's request.** Never claim unrun tests passed.
