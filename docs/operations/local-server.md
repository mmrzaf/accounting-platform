# Local HTTP API

`src/platform/server/` provides a Node HTTP listener and application composition root. It mounts authenticated identity, trading, financial-reporting, and optionally AI endpoints. The HTTP API is an implemented transport layer; **it is not a React/TanStack browser application**.

## Operation

```sh
corepack pnpm setup
corepack pnpm db:migrate
corepack pnpm app:bootstrap -- --slug example --name "Example" --admin-username owner --admin-name "Owner"
corepack pnpm app:serve
```

Default listener: `127.0.0.1:3000`. `GET /health/live` probes the listener, and `GET /health/ready` checks basic database availability. API route contracts are in `docs/api/`. The server refuses missing or pending migrations, and a failed listen attempt closes its database connection.

## Trust and network boundary

The configuration permits only loopback `APP_BIND_HOST` values. LAN access requires a separate, correctly configured HTTPS reverse proxy. Set `APP_PUBLIC_ORIGIN` to the exact public origin seen by users (including any nondefault port), and require matching `Host` and same-origin requests. Forwarded-host and forwarded-protocol headers do not grant trust. Cookies are HttpOnly and SameSite=Strict, with `Secure`/`__Host-` on HTTPS. Mutating requests require a valid CSRF token and server-side role authorization.

The listener limits request bodies to 16 KiB. As a result, the attachment service is **not** exposed as a generic binary-upload API. Business extensions such as stock, import, and tax configuration are available as TypeScript services, not necessarily as HTTP routes. Do not claim UI/API coverage for features solely because the underlying service exists.

To enable optional AI endpoints, set `APP_AI_MASTER_KEY_BASE64` to a confidential random 32-byte key encoded in Base64; protect and recover it separately. Live-provider interoperability and network-proxy acceptance are not certified.

## Outstanding release validation

The production browser application, Drizzle integration, Node 24/26 and Windows/macOS acceptance tests, browser E2E and accessibility tests, configured reverse-proxy tests, and production security review have not been completed. See [status](../validation/implementation-status.md).
