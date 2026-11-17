# Developer setup

Use Node.js **24** as the primary runtime. Node.js **22.16+** and **26** are intended compatibility targets. `pnpm` is pinned by `packageManager`; enable Corepack and install with a frozen lockfile on a connected machine.

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm app:doctor -- --json
```

The project has no framework UI dependency yet. Do not mistake the Node API for TanStack Start or the CSS tokens for a finished interface. Follow [bootstrap](../operations/identity-bootstrap.md) to create an administrator and [server operations](../operations/local-server.md) for the local API.

## Repository checks

- `check:types`: strict TypeScript across source, scripts and tests.
- `check:sources`: reject JS/MJS/CJS/JSX source files.
- `check:boundaries`: verify import dependency direction.
- `check:docs`: check required documents and local Markdown links.
- `build`: compile TS to ignored `dist/`.
- `test`: identity, accounting, trading, AI, infrastructure and HTTP regressions.
- `verify`: combined static checks, build and tests.

CLI commands run through Node and avoid shell-specific script assumptions. Platform claims require actual matrix results; see [release gates](../validation/release-gates.md).
