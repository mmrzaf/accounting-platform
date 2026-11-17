# System architecture and trust boundaries

```text
React / TanStack Router browser client
                |
    Authenticated Node HTTP adapters
                |
  Session company + RBAC authorization
                |
 Accounting / Trading / Identity / Reports / AI services
                |
        SQLite database (local WAL)
                +--- Company-owned attachment files
                +--- Complete snapshot / restore bundles
```

**Company is the only security, ownership and accounting boundary.** Each user has one immutable company. Sign-in takes username and password. HTTP services resolve company from the session, not request parameters. No organization table, company switching, or company-level UI selector exists. A local installation may hold several independent companies with isolated users, roles and records.

Services and SQLite constraints enforce financial integrity. React and AI are adapters to these services, not alternative accounting engines. Internal services may accept `companyId` for scoped calls; this is never a browser trust boundary.

The Node server serves the Vite-built SPA when `web/dist` exists. React source is present, but a browser build, accessibility and cross-platform acceptance are still release blockers. No Drizzle integration is claimed.

## Invariants

- SQLite lives on local storage; WAL permits concurrent readers but a single writer.
- Posted financial entries are balanced, immutable, and correctable through reversible entries.
- Mutations use short transactions, idempotency keys where material, and server-side permissions.
- AI output is untrusted; it passes through the same validated service contracts.
- Attachments are backed up with a consistent SQLite snapshot.
- LAN deployments require verified TLS termination and security configuration.
