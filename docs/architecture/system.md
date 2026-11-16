# System context and runtime boundaries

**Status:** Phase 0 design baseline; no deployed code.

```text
Browsers (Persian RTL / English LTR)
        |
        | LAN HTTP(S), session cookie, CSRF protection
        v
TanStack Start / Node.js (one process per installation)
        | server adapters (routes/functions, input validation)
        v
Authenticated application services <--- AI orchestrator (same service contracts)
        |                                    |
        | checked roles, org/company scope    +---- OpenAI-compatible endpoint
        | business rules, transactions              (only if configured/available)
        v
Domain modules / accounting posting
        |
        +------ SQLite on local server disk (migrations, WAL, FK checks)
        +------ Managed attachment storage (not publicly reachable)
        +------ Structured audit / operator logs
```

## Scope and trust boundaries

- **Installation:** deployment/backup boundary. One Node process owns one SQLite database file; do not put the active DB on NFS/SMB.
- **Organization:** strongest isolation boundary; every user belongs to exactly one. No switching between organizations inside a session.
- **Company:** accounting/legal unit within organization (pending signoff). Ledger, account codes, numbering, fiscal periods, base currency, and balances must never cross companies.
- **Request:** every application command receives server-derived actor and scope, not a trusted `organization_id` supplied by client or AI.
- **Money:** only the accounting engine creates posted journal lines, under an owned transactional boundary.
- **AI:** optional untrusted interpretation layer. Structured command plans are evaluated exactly as human UI commands.

## Deployment boundary

A locally installed Node application is accessed by browser over loopback by default. LAN access is deliberate, with HTTPS and a trusted local certificate or approved reverse proxy. Avoid default `0.0.0.0` exposure. External AI is optional and disabled until configured by an authorized administrator.

## Anti-patterns to avoid

No React components touching database connections, no implicit global current-company singleton in domain code, no cross-module raw SQL in controllers, no public financial response caches, no AI model publishing posted journal lines directly, no distributed-service infrastructure at the outset.
