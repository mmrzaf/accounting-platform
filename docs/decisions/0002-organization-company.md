# ADR-0002: Organization security and company accounting boundaries

- **Status:** Multi-company-ready identity schema implemented provisionally; user-facing choice pending
- **Date:** 2026-11-17

## Context

The original requirement was one tenant per user. Later discussion proposed one organization with multiple legal companies, but an earlier numbered reply was ambiguous. It would be unsafe to record this as fully approved.

## Proposed decision

`organization_id` defines user and security boundary; each user is in one organization. `company_id` defines a separate accounting ledger, currency, fiscal years and sensitive financial data inside that organization. One organization may contain several companies, with organization admin and company-scoped role grants.

## Alternatives

One organization = one company is simpler and reduces selectors/scoped permissions. Multi-company simplifies legitimate account reuse but requires explicit access control and prevents accidental blended reporting.

## Required next step

Confirm whether a single user needs to work across several legal companies within one login. Until then, this is a **modeling hypothesis**, not an approved schema.

## Phase 3 implementation note

`0002_identity_access.sql` permits multiple legal companies, but bootstrap creates one company. Organization-wide administrators receive explicit company-admin access to the initial company. No accounting ledger or company selector has been implemented. This remains a provisional extensibility choice, not approval of intercompany accounting.
