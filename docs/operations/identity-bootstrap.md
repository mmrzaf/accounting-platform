# Identity bootstrap, recovery, API usage

The local installation operator controls initial organization creation. **There is no public signup.** Passwords should never be put in command-line arguments, `.env` files, screenshots, shell history or log output.

## First organization and administrator

1. Choose Node 24 (or supported 22.16+ / 26), clone repository, run `npm run setup` and `npm run db:migrate`.
2. On an interactive terminal, run:

   ```text
   node scripts/app.ts organization:bootstrap --slug exampleco --name "Example Co" --admin-username owner --admin-name "Owner" --company-code main --company-name "Example Trading"
   ```

   The CLI asks for a hidden password. Minimum 12 characters, maximum 1024 UTF-8 bytes. Use a strong passphrase.
3. For noninteractive orchestration, securely pipe the secret via stdin and add `--password-stdin`; do not embed it in the shell command itself. The CLI returns JSON with the organization, company and initial administrator identifiers, **never** the password, hash or session token.
4. The administrator initially has organization-administration access and company-administration access to the initial company. Future companies created by that administrator grant company-admin to the creator automatically. New staff users start with **no roles** until explicitly assigned.

Bootstrap does not have a hard coded maximum number of organizations, companies or users. The product is currently optimized for approximately 1–2 organizations and fewer than five users on one installation.

## Lost admin credentials

With **trusted local filesystem/installation operator access**, use:

```text
corepack pnpm app:recover-admin -- --slug exampleco --admin-username owner
```

Password input is hidden on an interactive terminal, or accepted via `--password-stdin` in noninteractive mode. Only an existing organization administrator may be recovered through this command. It activates that user if disabled, increments credential version, revokes all their sessions, clears their login lockout and emits a `operator.admin_recovery` security audit event. This command is deliberately not exposed to HTTP or an AI tool.

## Application role and company semantics

- User belongs to exactly one **organization**.
- A role has scope `organization` or `company`; all permissions in it must match that scope.
- Assigning a company role requires a company ID in the user's organization. Assigning an organization role forbids a company ID.
- Organization-wide administration permissions do **not** automatically grant accounting access to each company. The initial administrator receives an explicit company grant at bootstrap.
- Company and organization lists are scoped and permission-filtered; unused roles do not grant anything.
- Disabling an account or changing/resetting its password revokes existing sessions.
- Role changes take effect on the next request because permissions are always read from the database.

System role templates: `organization-admin`, `company-admin`, `company-accountant`, `company-reader`, `company-operator`. Permissions are checked by the actual accounting and trading services; being an organization admin does not itself grant access to every company. Custom roles are supported by the service without direct per-user permissions.

## HTTP adapter integration

`src/platform/http/identity-handler.ts` exports a `createIdentityHttpHandler(service)` function consuming a Web `Request` and producing a Web `Response`. The adapter is **mounted on the running Node HTTP server**. The server constructs request URLs from a configured trusted public origin; HTTPS reverse proxy configuration is required for LAN access. The adapter does not honor arbitrary incoming `Host` or forwarded scheme headers.

- Session cookie is `__Host-accounting_session` for HTTPS (Secure, HttpOnly, SameSite=Strict), or `accounting_session` for local loopback HTTP development only.
- `POST /api/auth/login`: organization slug, username and password JSON; the response sets the cookie and returns CSRF token, current user and expiry. The opaque bearer token is never returned as JSON.
- `GET /api/auth/session`: validates current session and returns authenticated user, organization and CSRF token to rehydrate a browser session.
- Mutating endpoints require the `X-CSRF-Token` header from that same browser session, and matching Origin/Fetch-Metadata when present.
- All responses set `Cache-Control: no-store`; cross-origin requests are not allowed. The JSON body size limit is 16 KiB.
- User administration endpoints: `/api/users`, `/api/users/:id/status`, `/api/users/:id/reset-password`, `/api/users/:id/unlock`.
- Role endpoints: `/api/roles`, `/api/roles/assign`, `/api/roles/revoke`, `/api/roles/assignments?userId=UUID`.
- Company endpoints: `/api/companies`. Audit read endpoint: `/api/audit?limit=50`.
- No anonymous registration, arbitrary SQL, local installation recovery, or AI execution endpoints.

## Caution

The permissions layer protects only features that actually route through its application service and HTTP adapter. Accounting, attachment downloads, imports and AI tool calls are now routed through authorized services. Future endpoints must keep that property. Secure deployment and browser E2E verification remain outstanding.
