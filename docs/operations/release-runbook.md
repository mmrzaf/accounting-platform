# Release and pilot operations — NOT production certification

This runbook describes a **future controlled pilot**, not permission to store critical real business data today. The backend test suite has been exercised on Linux with Node 22.16. The React bundle and cross-platform matrix are still unverified. Do not advertise statutory Iranian compliance.

## Preflight (all mandatory before use)

1. Install Node 24 and pnpm in a clean environment; resolve dependencies from a trusted registry and generate/freeze the frontend lockfile. Validate Node 22.16 and 26 separately if claiming support.
2. Run `npm run verify`, `corepack pnpm --dir web check`, `corepack pnpm --dir web build`. Run browser E2E, accessibility, RTL/LTR, and financial acceptance suites. Review any exceptions.
3. Execute forward-only database migrations against a new database, create a bootstrap administrator, create a company, configure book/period/chart, and test a sample invoice, payment, allocation and correction through the actual browser.
4. Configure an OS-level service manager, a trusted TLS reverse proxy for LAN access, host firewall, and `APP_PUBLIC_ORIGIN` that matches the actual browser origin. Do not expose loopback HTTP directly to public networks.
5. Confirm file/directory permissions, operator account, session-cookie behavior over HTTPS, backup encryption/storage access, and confidentiality of AI credentials. Keep the `APP_AI_MASTER_KEY_BASE64` separate from the backup and source repository.
6. Schedule complete backup bundles (database **and** attachments), copy them off the host, define retention, restore into a fresh directory, and verify full workflow recovery. Assign a named person to check failures.
7. Record the initial database integrity result, software revision, migration status, and restore drill. Confirm a small-business representative accepts the manual workflow and financial reports.
8. Start with non-critical pilot data and a parallel reconciliation against the existing accounting process. Promote only after accounting and operational sign-off.

## Command sequence (once blockers cleared)

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm --dir web install --frozen-lockfile
corepack pnpm --dir web build
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm app:bootstrap -- --slug example --name "Example" --admin-username owner --admin-name "Owner"
corepack pnpm app:doctor
corepack pnpm app:serve
```

The CLI bootstrap prompts privately for a password. Do not pass passwords on the command line. After first login, configure the accounting book, fiscal period and chart from Settings. Set up realistic receivable/payable, bank, income and expense accounts, and test postings. No automatic chart template or legally verified Iranian setup is provided yet.

## Shutdown/recovery

- Stop writers before planned upgrades. Take a verified complete backup bundle before applying forward-only migrations.
- On restoration use `app:restore` into **new** paths. Never overwrite a live database or active attachment directory. Point the service to the restored paths only after verification.
- If a migration or source-code change fails, do **not** manually alter posted journal records. Restore a known-good snapshot using the documented procedure; reconcile transactions entered after the snapshot.
- After a crash, check SQLite integrity, migration status, attachments, and financial reconciliation before reopening to users.

## Explicit release blockers

Frontend lockfile and real build; browser E2E, RTL/Jalali and accessibility testing; Node 24/26 and Windows/macOS validation; persistence projection/schema review; regulatory review; valued inventory/COGS, tax posting, refunds and foreign-currency settlement; sustained operational backup and restore rehearsal; and final accounting/security approval.
