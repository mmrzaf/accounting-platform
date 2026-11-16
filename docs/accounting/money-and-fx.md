# Money, currencies, dates, and exchange differences

## Fundamental rule

Never use JS `number` for financial amounts or FX conversions. Represent stored monetary quantities as exact signed integer **minor units** where range is proven safe (SQLite signed 64-bit) or as an explicitly approved arbitrary-precision decimal strategy if limits require it. In application code use `bigint` and validated canonical serialization across browser/server boundaries. Decimal FX rates require a tested decimal library; do not convert to binary floating point.

## Currency and display

Each company has one accounting base currency, configurable before first posting and controlled afterward. Financial documents have explicit transaction currency independent of base currency. Currency metadata includes smallest unit and permitted display precision. **Toman** is typically a ten-Rial display denomination, not automatically a distinct ISO currency; preserve canonical IRR values with an unambiguous UI label and exact 10:1 conversion in applicable cases. User-entered '50 million Toman' must not silently mean 50 million IRR.

## FX policy to finalize

- Exchange-rate quote conventions (source/target), effective date, source, creator and full precision are stored.
- Each posted transaction locks its conversion rate and base amount. Recomputing historic journals from latest rates is prohibited.
- Realized FX differences on settlement use locked original receivable/payable basis vs. settlement base value.
- Period-end revaluation of open monetary balances is a separately approved explicit posting workflow, never an implicit report mutation.
- Rounding occurs at specified boundaries. Any residual must be deterministically assigned, visible and accounted for. Test positive/negative, fractional and multi-line cases.

## Dates

Store business dates as canonical ISO `YYYY-MM-DD` (semantically date-only, in the company's configured calendar policy) and instants as UTC timestamps. Jalali/Gregorian conversion only at input/output formatting edges; never store localized display strings. Fiscal period closure uses the company's defined timezone/date cutoff. Date-only values should not be converted through timezone-dependent midnight instants accidentally.

## Implemented decision and remaining gaps

The core now uses signed 64-bit SQLite `INTEGER` for each nonnegative base/foreign amount, canonical string serialization, `bigint` for all arithmetic and aggregation, rational FX rates stored as numerator/denominator, and per-line **round-half-to-even** conversion. Rates mean base minor units per foreign minor unit. Overflow is rejected. Report totals can exceed int64 because aggregation occurs in `bigint`. See [implemented ledger](implemented-ledger.md).

Realized settlement differences, period-end revaluation, currency conversion on source documents and formal fiscal-year closing remain **unimplemented**; they must not be inferred from the existing rate-snapshot functionality.
