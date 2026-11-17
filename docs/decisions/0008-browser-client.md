# ADR 0008 — Client-hosting architecture

**Status:** Accepted for first browser-client implementation, pending production-build verification.

## Context

This is a local-first application for one or two independent companies with fewer than five concurrent users. The repository already has a fully functional, authenticated Node HTTP API and a persistent SQLite transaction boundary. Introducing TanStack Start as a second runtime would duplicate the HTTP composition root or require a costly reorganization, without a concrete SSR or public SEO requirement.

## Decision

Use **React 19, TanStack Router and Vite 8** for a client-side browser application. Build static assets once and serve them from the **same Node.js HTTP origin** as the existing API. No public registration and no browser data replication. The API remains authoritative for sessions, validation, authorization, posting, idempotency, and auditing.

The browser uses only same-origin, HttpOnly session cookies; the CSRF token is obtained from the authenticated session endpoint and held in memory. Client-side routing does not grant access to data. TanStack Query is optional and should be added only when the data-fetching complexity justifies it.

## Alternatives

- **TanStack Start:** stable and reasonable, but SSR/server-function capabilities duplicate an already-tested API server for this LAN product. Reconsider if the backend is reorganized or SSR is needed.
- **A non-React temporary frontend:** rejected; it would create a legacy UI code path and future replacement work.
- **Native desktop shell:** out of scope; the browser is the deployment surface.

## Consequences and open gates

- The frontend has its own `web/` TypeScript build; the Node service serves only `web/dist` and never reads its source tree.
- Vite's dev proxy rewrites the development-only Origin to the configured backend origin; production has no proxy rewrite.
- Missing npm registry access prevented dependency installation, lockfile generation, framework typecheck, production build, E2E tests, and visual accessibility validation. These are **blocking**, not implicitly passed.
- The current frontend covers login, core invoice and payment workflow, trial balance, company setup, quantity stock, and initial AI actions, and company user/role administration. It is not an equivalent replacement for every backend feature.
