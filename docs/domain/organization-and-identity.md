# Organizations, companies, users

## Definitions

- `Organization`: security and owner account boundary, never silently inferred from request input. One user belongs to one organization only.
- `Company`: legal entity and accounting scope inside an organization **if company multiplicity is approved**. No company-to-company consolidation or intercompany posting in v1.
- `User`: active/inactive identity, unique login within the required scope; membership cannot be reassigned silently across organizations.
- `Role`: named collection of permission keys with a scope type; role membership is the only permission assignment mechanism.
- `Company context`: selected by UI but independently checked against user role grants and organization ownership on every call.

## Data invariants

- Every company belongs to exactly one organization.
- Every financial record belongs to exactly one company and organization; foreign keys must prevent cross-boundary references.
- A session for organization A cannot query an organization B company by guessing identifiers.
- Deactivating a user revokes active sessions; posted financial records retain stable actor provenance.
- Deleting companies with financial history is prohibited; use archival/inactivation when allowed.

## Shared and private data

Contacts and catalogue entries may be shared inside an organization as an efficiency optimization, but AR/AP balances, ledgers, tax records, journals, bank accounts and inventory valuation remain company-specific. Report queries must never infer financial aggregation across companies without an explicit future consolidation feature.

## Bootstrapping

Admin/operator creates first organization and administrator from local CLI. Subsequent users are created by authorized admin; no public signup. CLI must not echo passwords or leak secrets into shell history. Initial company creation should be one guided setup action.
