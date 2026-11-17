# Local HTTP server (interim adapter)

The repository now has a runnable HTTP host for the existing business services, implemented in TypeScript with Node's built-in `http` module. This host **is not the final TanStack Start / React deployment**. Its transport adapters, authorization tests and recovery tools are intended to be reused or migrated when the full framework stack is installed.

## Start a private installation

1. Install the pinned dev dependencies on a connected machine, use Node 24 as the primary supported runtime (Node 22.16+ and Node 26 are targets). The offline validation uses Node 22.16 only.
2. `npm run setup`, then `npm run db:migrate`, then `npm run app:bootstrap -- --slug example --name Example --admin-username owner --admin-name Owner` (password entered securely).
3. `npm run app:serve` starts the HTTP listener; by default it binds to `127.0.0.1:3000`.
4. `GET http://127.0.0.1:3000/health/live` checks the listener; `/health/ready` checks basic database availability. Both intentionally expose no financial details.

The server exits when it receives SIGTERM or SIGINT, closing its database connection. The `server:start` CLI refuses pending migrations or a missing database.

### LAN access

Never bind this temporary plain HTTP host directly to a LAN interface. Its listener **refuses `0.0.0.0` and other non-loopback addresses**. To use it on a LAN, deploy a separate, appropriately configured TLS reverse proxy bound to the LAN, which forwards to the Node loopback listener. Set `APP_PUBLIC_ORIGIN=https://accounting.example.internal` to the exact URL users see, including an external port if needed. That origin controls Host validation, same-origin checks and Secure session cookies.

This host deliberately does not trust `X-Forwarded-Host`, `X-Forwarded-Proto`, or other client-controlled proxy headers. The reverse proxy must enforce HTTPS, correct Host routing and TLS certificates, and restrict backend access to the loopback address. A reverse proxy does not magically make arbitrary HTTP LAN binding safe.

## Security properties

- The server reconstructs the Fetch Request URL from a configured canonical origin, **never** from untrusted forwarding headers.
- Requests with a mismatched `Host` are rejected, and the body is limited to 16 KiB before invoking services.
- Session cookies are HttpOnly and SameSite=Strict; production HTTPS uses a Secure `__Host-` cookie.
- Mutations require a live session and CSRF token, and reject cross-origin requests.
- Module services still independently enforce company isolation and action-level permissions.
- Posting, settlements and reversals run through existing transactional business services.
- The AI endpoints are disabled unless the operator supplies `APP_AI_MASTER_KEY_BASE64` (a confidential base64-encoded 32-byte random key). Neither the key nor provider API keys are logged. Protect and back up the master key *separately*; losing it makes existing encrypted provider credentials unreadable.

## Not yet delivered

There is **no React interface** or TanStack Start build in this repository. The Node HTTP host is an operational bridge and integration test target, not the endorsed production deployment. Framework dependencies, Drizzle schema mapping, responsive Persian/English UX, browser E2E, Node 24/26 runs, Windows/macOS runs, reverse proxy acceptance tests, and production incident/recovery drills remain open gates.
