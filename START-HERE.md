# Start here — developer and AI coding-agent handoff

This is financial software. **Do not run the current version on live financial records.** Complete both milestone checks, remaining workflow design, browser tests, and production acceptance first.

## 1. Understand the only company boundary

**There is only Company.** A user has exactly one immutable `company_id` and one or more company roles. Login accepts **username and password**; usernames are unique throughout the installation. Company is never selected in the UI and never taken from an untrusted request as authority. Companies are created **only** by a trusted local CLI operator. The current data model is described in [ADR-0009](docs/decisions/0009-single-company-boundary.md).

Review these, in order: [AGENTS.md](AGENTS.md), [architecture](docs/architecture/modules.md), [company model](docs/domain/company-and-identity.md), [accounting](docs/accounting/accounting-core.md), and [release status](docs/validation/implementation-status.md).

## 2. Inspect first, without installing dependencies

```sh
node --version
pnpm --version
node --experimental-strip-types scripts/handoff-check.ts
```

Use Node **24** as the main development version. Node 22.16+ and 26 are compatibility targets; pnpm **10.20.0** is the pinned package manager. **Corepack is optional and not required.**

## 3. Install, validate, build

```sh
pnpm install --frozen-lockfile
pnpm --dir web install --no-frozen-lockfile
pnpm run verify
pnpm run web:check
pnpm run web:build
```

The browser lockfile is not shipped because this environment cannot access npm. A connected developer must generate and review `web/pnpm-lock.yaml` through a real install, then commit it. Subsequent installs use `pnpm --dir web install --frozen-lockfile`. **Do not manufacture integrity fields.** The E2E runner is now included but has not been executed.

## 4. Bootstrap a fresh, disposable installation

```sh
cp .env.example .env             # review local storage paths before use
pnpm run setup                    # 'pnpm setup' is pnpm's built-in command, NOT this script
pnpm run db:migrate
pnpm run app:bootstrap -- --name "Example Company" --admin-username owner --admin-name "Owner"
pnpm run app:doctor
pnpm run app:serve
```

The CLI prompts for the password securely; it does not accept passwords as shell arguments. Visit **http://127.0.0.1:3000** and enter username `owner` and the password. **There is no company slug, switcher, or selection screen.** On the **Overview** screen, follow the guided accounting setup: choose the reporting currency, create the starter chart and define the fiscal period. The starter chart configures the five basic posting accounts; edit them under Settings if needed. This is a test starter chart, **not a statutory Iranian chart**. Use real business data only after accounting review. See [core workflow acceptance](docs/ux/workflow-acceptance.md).

For frontend development, run `pnpm run web:dev` separately with the backend running. This uses a local Vite proxy; do not publish the dev server.

### Optional: enable the contextual AI assistant

AI is **off** until a local encryption key and company provider are configured. Do not paste an API key into CLI arguments. From the project directory:

```sh
pnpm run app:ai-initialize  # safely creates APP_AI_MASTER_KEY_BASE64 in your local .env; refuses overwrite
pnpm run app:serve          # restart the server if it is already running
```

Sign in as an administrator and open **Settings → AI & privacy** to enter the OpenAI-compatible base URL, model, and provider API key. The browser never receives saved provider secrets. Back up the private `.env` file securely; the AI encryption key must remain available to decrypt configured provider credentials. If AI is not configured, the assistant displays a helpful setup state rather than accepting unusable requests. The core accounting application is independent of AI. If Groq or another API provider requires a local HTTP proxy, set `APP_AI_PROXY_URL=http://127.0.0.1:1080` in `.env` and restart the server; see [AI proxy setup](docs/ai/http-proxy.md).


## 4A. Actual browser acceptance (Milestone 5)

```sh
pnpm --dir web exec playwright install --with-deps chromium
pnpm run web:e2e
```

This runs a **production-built** React app against a disposable temporary SQLite database and test company. The fixture does not read or alter your installation database. The browser and live provider could not be verified here because the npm registry is unavailable, so do not assume these commands pass until they have been executed on a connected machine. See [release acceptance](docs/validation/release-acceptance.md).

Milestone 5 adds a safe starter accounting chart (Settings, only for empty books), an invoice print/PDF layout, trial-balance CSV export, and interrupted-assistant-turn reconciliation. The built-in chart is **not** an Iranian statutory chart. Real production use still requires the accounting/operational gates.

## 5. Agent engineering requirements

Use the established module boundaries. All new source is strict `.ts` / `.tsx`. Design a complete vertical workflow, including authorization, database constraints, UI states and accessibility, and accounting regression tests. There is no old-database migration pathway: this is a fresh product with one initial migration.

Run `pnpm run verify`, `pnpm run web:check`, `pnpm run web:build` and `pnpm run web:e2e` on a connected machine. Record **actual** checks and any skipped validations. Keep documentation accurate; use focused conventional commits with author `mmrzaf <mohammr.farkhonde12@sharif.edu>`.

## 6. Browser UX acceptance

After `web:build` and the Node server start, inspect the following manually in **Persian RTL and English LTR**, on desktop and a narrow viewport:

1. Newly bootstrapped company: Overview guides setup without showing raw "Accounting record not found" errors.
2. Complete book/chart/period setup, create a contact, post a sales invoice, record partial receipt, inspect the ledger.
3. Empty directories explain the next action; populated records support search, filtering and drill-down.
4. AI missing: contextual panel gives setup instructions. AI enabled: conversation and invoice context, approval preview and created-record links function correctly.
5. Verify logout, keyboard focus, responsive navigation, invoice printing and error recovery.

See [UX release checklist](docs/ux/ui-release-checklist.md) for detailed acceptance.

## 7. Current unfinished release gates

Browser build and real interaction testing after the shell redesign, fiscal close, FX settlements, valued stock, full refunds, tax journal posting, live-provider acceptance for the contextual assistant and general multi-action agent execution, Drizzle decision, and regulatory sign-off. See [open work](docs/roadmap/open-work.md). Do not declare production-ready because an API responds successfully.
