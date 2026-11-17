# Release acceptance matrix — evidence, not promises

## Gate 1 — Dependency integrity and build

- [ ] On Node 24, install root and web dependencies, resolve and **commit** a genuine `web/pnpm-lock.yaml` from the registry.
- [ ] Update root `@types/node` to a reviewed 24.x release and regenerate the root lockfile using pnpm, without manually synthesizing integrity strings.
- [ ] `pnpm install --frozen-lockfile` and `pnpm --dir web install --frozen-lockfile` both succeed in a clean checkout.
- [ ] `pnpm run verify`, `pnpm run web:check` and `pnpm run web:build` succeed with no suppressed diagnostics.
- [ ] `pnpm --dir web exec playwright install --with-deps chromium` and `pnpm run web:e2e` pass against the **production-built** SPA and disposable SQLite fixture.
- [ ] Run browser checks in Firefox/WebKit and inspect keyboard, screen-reader and Persian RTL/mixed numeric content. Chromium smoke alone is insufficient.

## Gate 2 — Accounting invariants and usability

- [ ] Fresh CLI bootstrap → username/password login → create accounting book → create and review starter chart → create period.
- [ ] Record and post a multi-line sale, inspect debit/credit journal and trial balance, record and allocate a partial receipt, verify outstanding balance.
- [ ] Repeat with a purchase and partial disbursement; check credit, reversal, zero/over-allocation and retry/idempotency behavior.
- [ ] Print invoice and export trial balance CSV in both languages; confirm no raw account IDs, CSV formula execution or wrong currency scaling.
- [ ] Validate a clean parallel reconciliation using an external accounting baseline supplied by a qualified accountant.
- [ ] Prove cross-company access fails even when attacker supplies a different record UUID, session, query and request body.

## Gate 3 — AI and privacy

- [ ] Configure a provider and encryption key; restart the application and verify persistent configuration without printing secrets.
- [ ] In Persian and English, resolve a contact, create an invoice and partially pay it, review execution policy and actual ledger effects.
- [ ] Confirm interruptions, stale approvals, duplicate request IDs, revoked roles, invalid amounts and failed tools do not post incomplete financial entries.
- [ ] Explain to users when third-party providers receive financial context; approve a retention/deletion policy before production.

## Gate 4 — Operations and regulatory

- [ ] Test Node 24 on Windows/macOS/Linux, plus advertised Node 22/26 compatibility; record exact versions and logs.
- [ ] Validate TLS, secure cookies, LAN access through a trusted reverse proxy, CSRF/Host controls and local firewall rules.
- [ ] Schedule a consistent off-host backup of database **and** attachments; restore it on a fresh machine and reconcile balances and blob hashes.
- [ ] Document unsupported product features and prevent the UI from implying statutory compliance, automatic tax posting, valued inventory or bank transfers.
- [ ] Obtain final accounting, security and Iranian legal/tax sign-off for the proposed real deployment.

**Go/no-go:** Until every gate applicable to the intended real financial workflow has been completed and evidenced, only use disposable or parallel test data.
