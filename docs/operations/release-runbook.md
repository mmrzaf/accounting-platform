# Release / controlled pilot runbook

This is a runbook for a **future acceptance and pilot**, not certification to store real company financial data. Start at [START-HERE](../../START-HERE.md) and consult the [release acceptance matrix](../validation/release-acceptance.md).

## Dependency and test preflight

Use Node 24 and pnpm 10.20.0 (without Corepack). A connected machine must first install frontend dependencies, including Playwright, and create/review/commit the missing frontend pnpm lockfile. The root Node typings must be reviewed against Node 24 too.

```sh
pnpm install --frozen-lockfile
pnpm --dir web install --no-frozen-lockfile  # first connected setup only
# review and commit web/pnpm-lock.yaml; future installs use --frozen-lockfile
pnpm run verify
pnpm run web:check
pnpm run web:build
pnpm --dir web exec playwright install --with-deps chromium
pnpm run web:e2e
```

The E2E harness uses a **new disposable temporary database**, creates its own test company and erases its files on shutdown. It does not require the developer's `.env` or production database.

## Create a fresh local test installation

```sh
cp .env.example .env            # optional; configure paths and local origin
pnpm run setup                  # do NOT use `pnpm setup`
pnpm run db:migrate
pnpm run app:bootstrap -- --name "Example Company" --admin-username owner --admin-name "Owner"
pnpm run app:doctor
pnpm run app:serve
```

Sign in at `http://127.0.0.1:3000` using username and password, with **no company selection**. In Settings, create the book and a fiscal period. On an empty chart, the basic starter chart can create seven accounts and posting defaults in one atomic operation. It is a trial convenience **not** a legally reviewed chart; make any necessary accounting changes before financial posting.

## AI configuration

Set `APP_AI_MASTER_KEY_BASE64` to 32 cryptographically random bytes, encoded as standard base64, in a protected installation environment or `.env` that is **not committed**. Keep this key with separately secured recovery documentation: losing it prevents decrypting stored provider credentials. Restart the local Node server; an administrator can then configure the provider and autonomy policy inside Settings. The core accounting application works without AI.

## Production operations — pending approval

Use the same-origin Node API and Vite-built client behind a trusted TLS reverse proxy for LAN use. Configure `APP_PUBLIC_ORIGIN` to the exact browser origin; do not change the loopback binding to an arbitrary public interface. Set OS service restart/monitoring, secure file permissions, backup alerts, and an off-host retention policy.

Before updates take a complete verified backup (SQLite + attachments). Restore **into different empty paths** and compare account balances, audit records and attachment hashes. Do not manually edit posted journals during recovery. Do not claim statutory Iranian tax support or external banking transfers.
