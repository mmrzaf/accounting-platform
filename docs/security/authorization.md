# Authorization, tenancy and data security

## Identity and permissions

One user belongs to exactly one organization. Permissions are assigned to **roles**, roles are assigned to users, and users may have multiple roles. No direct user-specific grant exceptions. Permission names take `resource.action` form, for example `invoice.read`, `invoice.post`, `payment.create`, `journal.reverse`, `period.close`, `users.manage`, `ai.configure`. Distinguish `read` vs `export`, `create` vs `post`, `reverse` vs `delete` and `configure` vs use.

Phase 3 implementation: grants either organization-wide (administrative functions) or company-specific (accounting and operational functions). A role definition is a permission template; a user's assignment to a company grants it there only. Organization administrators manage users/companies/roles but receive explicit company-admin membership to access company data. User-facing company multiplicity still requires signoff.

## Server authorization sequence

1. Validate session and user active status.
2. Derive organization from authenticated identity, never from request body.
3. Resolve requested company and verify that it belongs to organization.
4. Check effective role grants for the action and company.
5. Enforce entity-specific business rules (open period, document ownership, status, threshold policy) in application services.
6. Execute tenant-scoped query and commit/audit. Never rely on UI-hidden actions as enforcement.

## Persistence defense in depth

- Every company-owned row references a company within its organization via validated composite relationships where possible.
- `organization_id` is required on organization-owned records; companies and company-owned facts use composite `(organization_id, company_id)` constraints where helpful.
- Composite foreign keys and scoped unique indexes prevent cross-organization references even when application code makes an error. Enable SQLite `PRAGMA foreign_keys = ON` on each connection.
- Queries and joins must use organization/company scope; role checks are not a substitute for scoped SQL.
- Cross-organization and cross-company negative tests cover UI/server functions, reports, downloads, CLI and AI.

## Web and operational security

Phase 3 provides scrypt hashing, opaque random bearer sessions stored by hash, secure/httpOnly/sameSite cookies in the Web adapter, CSRF enforcement, persistent account lockout, session invalidation and no-store identity responses. LAN TLS, actual server mounting, broader rate limits and protected attachment paths require future integration. The app must bind to loopback unless LAN access is explicitly enabled. Network-level access is not a substitute for authentication.

## Audit

Record actor, organization/company, action, source, outcome, time, affected IDs and request correlation. Capture role changes and AI execution provenance. Never log plaintext credentials, raw AI provider keys or unnecessary sensitive payloads. SQLite triggers reject UPDATE and DELETE on security audit rows for ordinary application writes. This is **not cryptographic tamper evidence** against database operators. Business/AI audit integration remains future work.
