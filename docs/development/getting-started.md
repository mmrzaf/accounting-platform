# Development setup — strict TypeScript foundation

## Runtime contract

Primary: Node **24.x**. Compatibility targets: Node **22.16+** and **26.x**, pending actual CI evidence. Node 23/25 and unsupported majors are rejected by the CLI. `.nvmrc` and `.node-version` specify the primary major.

`pnpm@10.20.0` is pinned. Direct devDependencies: `typescript@5.8.3` and `@types/node@25.1.0`, with a tracked lockfile. **The frozen install has not yet been exercised because the build environment cannot access the package registry.** No third-party runtime packages exist yet; this is intentionally an offline-testable technical foundation, not the production TanStack Start dependency graph.

Every `.ts` source in application, scripts, experiments and tests is checked by the same strict TypeScript config, and a dedicated check rejects `.mjs`/`.js` sources. The build compiles TypeScript to ignored `dist/`. Node's TypeScript stripping is used to execute operational scripts and tests without a preprocessing service. The production framework build remains a separate gate.

## First run

1. Install a supported Node runtime (prefer 24.x) and enable Corepack.
2. Install dependencies using `corepack pnpm install --frozen-lockfile`; verify lockfile integrity in connected CI.
3. Optionally copy `.env.example` to `.env` and configure `APP_DB_PATH`, `APP_BACKUP_DIR`, `APP_BIND_HOST` or `APP_PORT`. Environment variables override `.env`.
4. Run `corepack pnpm verify`, `corepack pnpm setup`, `corepack pnpm db:migrate`, and `corepack pnpm app:doctor`.
5. Bootstrap the initial company and administrator using `corepack pnpm app:bootstrap -- --slug exampleco --name "Example Co" --admin-username owner --admin-name "Owner"`. Password is requested privately; see [identity bootstrap](../operations/identity-bootstrap.md).
6. Open `experiments/ux-preview/ux-preview.html` in a browser to inspect the static RTL/LTR fixture.

`setup` creates local directories only. `db:migrate` and bootstrap are separate, deliberate steps. No server is started; no accounting records exist.

## Cross-platform behavior

All public commands are package scripts calling Node, not Bash-specific shell fragments. Tests construct file paths with `fileURLToPath`, including on Windows. **Platform behavior is not certified until the CI matrix actually passes.**

## Verification commands

- `npm run check:types`: strict TypeScript on every source, experiment, script and test.
- `npm run check:sources`: reject JavaScript source and syntax errors.
- `npm run check:boundaries`: enforce the initial architecture import directions.
- `npm run check:docs`: check required Markdown and local links.
- `npm run build`: emit compiled JavaScript and declarations into ignored `dist/`.
- `npm test`: infrastructure, SQLite and identity regression tests.
- `npm run verify`: execute all of the above.

## Current limitations

No live framework packages, TanStack Start production build, real HTTP server, React screens, Drizzle integration, external AI providers, financial migrations, or accountant UX are implemented. The administrative SQLite layer uses `node:sqlite`, whose availability and runtime behavior must be revalidated on every supported Node version before production. The backup scope is SQLite only.
