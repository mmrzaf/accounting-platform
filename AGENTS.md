# Contributor and coding-agent instructions

This repository contains financial software. Do not treat a successful compilation as proof of accounting correctness.

1. **Use TypeScript for source and tests.** Do not add JavaScript or `.mjs` source files. Generated build output belongs outside Git.
2. **Preserve the accounting invariants.** Never mutate posted journal history, use floating-point amounts as financial truth, bypass transactional posting, or accept client-provided organization identity. Read [ledger invariants](docs/accounting/accounting-core.md) before financial changes.
3. **Respect authorization at the service boundary.** Organization and company access is derived from a live session; role assignments determine permissions. AI gets no privilege of its own.
4. **Keep module ownership explicit.** Route adapters decode and validate untrusted input; modules implement use cases; persistence remains under controlled access. Read [module dependencies](docs/development/module-boundaries.md).
5. **Never modify applied migrations.** Add new migrations, verify exact-money constraints, and preserve composite organization/company database references.
6. **Handle credentials safely.** No keys, passwords, session tokens, or provider credentials in arguments, URLs, repository files, telemetry or logs. Local administrator recovery must remain CLI-only.
7. **Use only the complete backup format.** Database-only copies do not preserve attachment integrity; verify and periodically restore complete bundles. See [recovery](docs/operations/complete-backups.md).
8. **Document actual capability, not intent.** There is a Node HTTP API and React/TanStack Router client source, but its real build and browser acceptance, live-provider acceptance, and production certification remain outstanding. See [implementation status](docs/validation/implementation-status.md).
9. **Use focused Conventional Commits** (`feat(module): ...`, `fix(module): ...`, `refactor(module): ...`, `test(module): ...`, `docs(module): ...`). Repository author is `mmrzaf <mohammr.farkhonde12@sharif.edu>`.

Before proposing a commit, verify the precise module boundary, add targeted positive/negative/cross-company regression coverage, and normally run `pnpm verify` plus relevant platform checks. This repository has backend verification evidence but not a React dependency installation, bundle build, browser E2E pass, or complete runtime matrix. Never claim unrun checks passed.

## Browser client (React)

The `web/` client is a separate TypeScript/Vite project with TanStack Router. No app credentials or financial business rules belong in this client. It uses only same-origin authenticated HTTP services and exact string minor-unit money conversion. Do not silently change the browser architecture or introduce a second server. The frontend dependency lockfile, typecheck, build and E2E suite remain release gates until executed on a connected machine. Read `docs/development/web-client.md` and ADR 0008 before making browser changes.
