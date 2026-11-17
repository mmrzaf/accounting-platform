# Engineering conventions

- `src/modules/`: accounting, identity, trading, AI, reports and bounded business-extension services. Modules enforce business invariants, not HTTP handlers.
- `src/platform/`: SQLite access/migrations, HTTP and Node host, runtime configuration, structured logging, complete backups.
- `src/ui/`: framework-independent locale formatting only; the actual React client is in `web/`.
- `scripts/`: operator CLI and source/documentation/boundary checks.
- `migrations/`: immutable SQL history. Applied migration checksums must never change.
- `tests/`: executable infrastructure, accounting, identity, trading, AI and HTTP regression tests.

Use strict TypeScript, explicit input validation, exact integer monetary representations, company scoping, short transactions, and one source of financial truth. No generated `dist/`, database files, backups, credentials, or dependencies in Git.

The public HTTP listener is loopback-only, with separate HTTPS termination required for LAN clients. Operators create and verify a **complete** database-and-attachments backup; standalone SQLite copies are not a supported recovery operation.

Use [Conventional Commits](commit-conventions.md), review [module boundaries](module-boundaries.md), and keep [implementation status](../validation/implementation-status.md) accurate. A new feature must include corresponding regression coverage and should pass `pnpm verify` before merging. Unrun verification must be explicitly identified.
