# Local application server and browser UI

The **actual server** is the loopback Node HTTP listener in `src/platform/server/`, composed by `createApplication`. It mounts identity, accounting, trading, reports, extensions (inventory, tax, CSV import, credit notes, attachments) and **optionally** AI endpoints. It also serves the compiled React/TanStack Router SPA from `web/dist` if the bundle exists. The frontend build has **not been verified** in this environment.

## Start and health

From the repo root, after following [START-HERE](../../START-HERE.md) and initializing the database:

```sh
pnpm app:doctor -- --json
pnpm app:serve
```

Default origin: `http://127.0.0.1:3000`. `GET /health/live` reports process reachability; `GET /health/ready` checks database reachability. `app:doctor` reports database integrity, pending migrations, and whether the browser bundle exists. A successful API startup is **not** proof that the UI was built; the CLI explicitly reports `browserBuilt`.

Development browser: `pnpm web:dev` runs Vite separately on loopback port 5173 and proxies `/api` to port 3000. Production browser: `pnpm web:build` writes `web/dist`; the Node server serves it and API from the same origin. Unknown `/api/*` paths return JSON **404** even when a SPA build exists.

## Security boundary

- The listener accepts only `127.0.0.1`, `localhost`, or `::1`. Do not bind it directly to a public/LAN interface.
- For LAN use, configure a trusted HTTPS reverse proxy and set `APP_PUBLIC_ORIGIN` to the exact browser-facing origin. Do not trust arbitrary incoming Host/forwarded-protocol headers.
- Authentication uses HttpOnly same-origin session cookies; state changes enforce CSRF and origin checks. Service authorization is mandatory regardless of the route or AI tool.
- Default JSON body limit: **16 KiB**. Contact CSV import: **2 MiB**. JSON/base64 document upload: **14 MiB wire-body bound** to accommodate the service's **10 MiB decoded attachment limit**. Do not confuse those limits.
- No public registration. Initial administrators are created through the local CLI, not over HTTP.
- A missing AI master key disables AI HTTP endpoints with `503`; it does not affect manual accounting.
- Unknown API routes return JSON 404 and never the React SPA shell.

Do not use this server on the public Internet without separate TLS/proxy, backup/recovery, operating-system and financial-security acceptance. See the [release runbook](release-runbook.md).
