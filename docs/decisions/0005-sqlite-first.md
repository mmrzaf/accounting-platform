# ADR-0005: SQLite first, local-server topology

- **Status:** Accepted initial database; operational policy proposed
- **Date:** 2026-11-17

## Decision

One SQLite file with explicit organization and company scoping; enforce FKs, unique constraints, short transactions and single-writer reality. Use consistent backup/snapshot and verified restore. Initial driver candidate is `better-sqlite3`, contingent on live compatibility tests.

## Consequences

Excellent small-installation simplicity. Cross-host active shared files, distributed writes and unbounded concurrency are not supported. PostgreSQL migration means deliberate redesign/testing of SQL-specific behavior, concurrency and migrations.
