# React browser client

The browser application lives in `web/`. Organization administration includes company creation, users and role assignments, using the existing identity endpoints. It uses React, TanStack Router, TypeScript, Vite, and semantic/native form controls. Both Persian RTL and English LTR are supported in the main shell; date inputs currently use the browser's Gregorian date picker. This is **not** a finished accessibility or localization certification.

## Develop

On a machine with working npm registry access and Node 24 (Node 22.16+ and 26 are compatibility targets):

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
# Bootstrap a new organization from the CLI as described in README.md
corepack pnpm app:serve

# In a second terminal:
corepack pnpm --dir web install
corepack pnpm --dir web dev
```

Vite development URL: `http://127.0.0.1:5173`. Requests to `/api` are proxied to the loopback Node server on port 3000, with a development-only Origin rewrite so the same-origin CSRF defense works. **Never deploy the Vite dev server to users or open it to the LAN.** The backend must use `APP_PUBLIC_ORIGIN=http://127.0.0.1:3000` in this setup.

## Build and serve

```sh
corepack pnpm --dir web check
corepack pnpm --dir web build
corepack pnpm app:serve
```

When `web/dist/index.html` is present, the Node HTTP server serves the browser UI and API from the **same origin**. In the initial configuration only loopback binding is supported; LAN access needs a reviewed HTTPS reverse-proxy configuration. The API remains available even if no client bundle has been built.

**Dependency lock warning:** The connected npm registry was unavailable when this client source was authored. `web/` therefore does not yet have a generated `pnpm-lock.yaml`, and its TypeScript + Vite build has not been executed. Generate and commit a real lockfile on a connected machine, review resolved versions and advisories, and use `--frozen-lockfile` thereafter. Do not treat syntax parsing as a production build or release sign-off.

## Design contracts

- UI never constructs journal lines for purchase/sales documents; it calls existing business services through their API.
- Never cache session tokens in storage; browser cookies remain HttpOnly.
- API errors are presented as server-provided codes/messages without exposing SQL or stack traces.
- Monetary input is converted to integer minor units using `bigint`, without `Number` rounding.
- Financial posting requires permissions, and the UI makes the distinction between drafts and posted documents explicit.
- Do not automatically treat missing API data, permission denial, or server downtime as “company not configured.”
- User-visible financial data requires verified cross-company isolation and real E2E testing before rollout.
