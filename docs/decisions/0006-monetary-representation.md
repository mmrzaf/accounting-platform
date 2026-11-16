# ADR-0006: Exact currency arithmetic for the standalone ledger

- **Status:** Implemented in standalone accounting core; revisit for source workflows and database adapter
- **Date:** 2026-11-17

## Implemented choice

Store transaction and base amounts in exact minor units, using 64-bit SQLite INTEGER and `bigint` with explicit overflow guards. Store currency code/precision and immutable **rational** FX rate snapshots (integer numerator and denominator). Round converted line amounts half-to-even, validate exact balanced base sums, and use an exact `bigint_total` SQL aggregate for posting-trigger checks. Serialize amounts explicitly across RPC boundaries; never use `number` for money.

## Alternatives

Arbitrary-precision decimal text offers wider range but requires a verified aggregation/index strategy; integer minor units are efficient but bounded and cannot represent finer-than-minor tax allocations without explicit rounding.

## Evidence and limitations

Executable tests prove >2^53 amounts, aggregate totals exceeding signed int64, idempotency, reversals, and persisted FX snapshots. `node:sqlite` is used in the offline proof; a production driver swap must reproduce these invariants. Taxes, cash settlement FX gain/loss, period-end revaluation and local-currency entry UX remain future workflows.
