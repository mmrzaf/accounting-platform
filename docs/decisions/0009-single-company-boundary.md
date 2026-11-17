# ADR-0009 — Single Company boundary

- **Status:** Accepted
- **Date:** 2026-11-17

## Decision

Company is the only business, accounting, identity and authorization boundary. Every user belongs permanently to exactly one company; `users.company_id` is immutable and usernames are unique case-insensitively across the installation. Authentication takes username and password only. The session determines the user's company. There is no tenant slug, organization record, company selector or switching flow.

A database installation may hold several independent companies. Company creation belongs to a trusted local operator. Company users, roles, contacts, records, ledger, AI credentials, documents and attachments never cross company boundaries.

## Schema lifecycle

This product has no production data. The current database is defined by **one initial SQL migration**, `migrations/0001_initial.sql`. There is no legacy conversion utility or compatibility shim. After real deployment, schema changes must use reviewed sequential migrations rather than rewriting applied files.

## Consequences

Financial queries, role assignments, API calls and AI operations must be tested against cross-company disclosure and mutation. The company label may be displayed as identity information but must never be selectable.
