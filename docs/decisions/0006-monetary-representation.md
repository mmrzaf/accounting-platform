# ADR-0006: Exact currency arithmetic (storage strategy pending)

- **Status:** Proposed
- **Date:** 2026-11-17

## Decision candidate

Store transaction and base amounts in exact minor units, using 64-bit SQLite INTEGER and `bigint` with explicit overflow guards. Store currency code/precision and immutable decimal FX rate snapshots. Serialize amounts explicitly across RPC boundaries; never use `number` for money.

## Alternatives

Arbitrary-precision decimal text offers wider range but requires a verified aggregation/index strategy; integer minor units are efficient but bounded and cannot represent finer-than-minor tax allocations without explicit rounding.

## Required proof

Check total/report overflow, tax/FX rounding, Toman/IRR display conversion, serialization and database adapter behavior. Choose a tested decimal library before accounting feature implementation.
