# React client — development and verification

The client lives in `web/`: React, TanStack Router, Vite and TypeScript. The Node HTTP server hosts `web/dist` in production. There is no second backend framework. **Company** is the sole security/ownership boundary; login uses username and password only. Financial mutations are performed by authenticated service endpoints, never by client-side ledger calculations.

After a connected developer resolves and commits `web/pnpm-lock.yaml`, use:

```sh
pnpm install --frozen-lockfile
pnpm --dir web install --frozen-lockfile
pnpm run web:check
pnpm run web:build
pnpm run app:serve
```

For development start backend and then `pnpm run web:dev` in another terminal. Verify normal workflows in Persian RTL and English LTR. The current source contains invoice, payment, contact, accounting ledger and administration workspaces. Currency/quantity previews use exact `bigint` and ties-to-even rounding; posted accounting data comes from the server.

**Release blockers:** run and fix real web typechecking, browser build, E2E and accessibility checks; ensure Node 24 and browser compatibility. The absence of npm package access here is not evidence that this client builds.
