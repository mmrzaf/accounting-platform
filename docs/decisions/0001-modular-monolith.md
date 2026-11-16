# ADR-0001: Modular monolith and framework-independent services

- **Status:** Proposed
- **Date:** 2026-11-17

## Context

A small offline-capable installation requires coherent accounting transactions, minimal operational burden, and agent-friendly development. A microservice split increases coordination, deployment, and distributed consistency costs without a real requirement.

## Decision

One Node.js deployment, modular monolith, local SQLite. Transport/AI/CLI are adapters; application services own use cases and transaction boundaries. Domain invariants are independent of UI, language-model provider and persistence driver.

## Tradeoffs

Simple deployment and local transactions; must enforce import boundaries and modular ownership inside one process. Database migration to PostgreSQL would require SQL/concurrency changes, not merely replacing drivers.

## Review trigger

Measured workload or isolation requirements exceed single-node database/processing assumptions.
