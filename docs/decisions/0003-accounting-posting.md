# ADR-0003: Source documents post through one immutable ledger

- **Status:** Accepted principle; detailed accounting policy proposed
- **Date:** 2026-11-17

## Context

Business users should not manually create double-entry lines for routine invoices, but financial reports must not depend on inconsistent per-module balances.

## Decision

Draft documents do not affect GL. Finalization posts a deterministic balanced journal in the same transaction as document state change. Use idempotency and unique source references. Posted lines cannot be destructively changed; reversals/adjustments preserve historical evidence. Approval can be disabled for authorized routine work.

## Consequences

Simple UX and reliable history. Must carefully model returns, partial payments, advances, FX and corrections. Account mapping errors are validation failures, never silently improvised by AI.
