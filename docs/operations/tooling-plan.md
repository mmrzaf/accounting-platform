# Developer tooling and agent workflow — proposed Phase 2 contracts

The current repository is deliberately **not** an initialized TanStack project. Only Phase 1 offline probes are runnable. Do not mistake the `package.json` here for an application manifest or locked dependency set.

## Suggested application commands

`pnpm setup`, `pnpm dev`, `pnpm check`, `pnpm test`, `pnpm test:e2e`, `pnpm verify`, `pnpm db:migrate`, `pnpm app:doctor`, `pnpm app:backup`, `pnpm app:restore`, `pnpm build`, `pnpm start`.

Command semantics should be documented and deterministic: no implicit migration in production serving, no interactive prompts in CI, structured errors, safe no-op behavior where idempotency is appropriate, and explicit account/installation context for destructive operations.

## Repository standards

Single root package unless a real deployable split emerges. Each business module owns its tests and internal contracts. Shared primitives remain small and stable. Use import-boundary linting and strict TS; centralize error structure, permission naming, date/money serialization and logging. Define ESLint/Oxlint/formatter choice after checking current compatibility, instead of stacking incompatible tools.

## Agent completion checklist

Agent must state changed files, requirement/ADR followed, test evidence actually executed, unresolved cases, and a clean diff. Agent cannot self-approve security boundary changes, accounting invariant changes, or speculative regulatory integrations. Tests for money, permission and organization/company isolation are required alongside affected code.

## Release discipline

Commit small coherent changes, do not commit `.env`, DB files, generated secrets or bundled dependencies. Produce an archive with Git history after each approved phase, verify extracted repository HEAD and clean status, and publish an SHA256 digest for integrity.
