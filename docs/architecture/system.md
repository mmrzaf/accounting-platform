# System architecture and trust boundaries

## Implemented backend

```text
CLI / Node HTTP request / AI operator
                 |
     Authenticated service calls
                 |
   Identity -> Accounting -> Trading
                 |             |
                 +------ Business extensions and reports
                 |
         SQLite (local WAL)
                 +--- Managed immutable attachment blobs
                 +--- Complete backup bundles
```

Organizations isolate users and business data. Each company holds separate ledger, fiscal periods, currency and accounting source records. User sessions belong to one organization; company access follows assigned roles. HTTP handlers decode requests and invoke the same application services used by the AI tools.

The React/TanStack Router SPA source now lives under `web/`, and the Node server serves its production bundle from `web/dist` when available. The SPA build and browser E2E have **not** been certified. Drizzle-backed persistence and automatic bank integrations are not present. See [implementation status](../validation/implementation-status.md).

## Invariants and operational assumptions

- SQLite must reside on local storage; WAL permits concurrent readers but only one writer.
- Accounting uses exact minor units and balanced, append-only journal posts.
- Domain services enforce scopes and permissions independently of transport adapters.
- AI plans are untrusted inputs and are subject to the same validations and transaction boundaries.
- Attachments live in managed local storage and are backed up with the database's committed attachment metadata.
- The HTTP listener accepts loopback connections only; LAN use requires TLS termination and a verified proxy configuration.

Do not silently introduce multi-process writers, cross-company accounting truth, external financial mutations, or autonomous privileged AI operations without a revised architecture decision and tests.
