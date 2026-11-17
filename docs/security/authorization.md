# Authorization and company data security

**One user → one Company.** There is no Organization entity and no company switching. Login uses globally unique username and password. Company association is resolved exclusively from the authenticated session. Never trust company identifiers on HTTP requests or AI tool inputs as an authority.

Permissions are named actions (`accounting.post`, `accounting.reverse`, `users.manage`, `ai.execute`), assigned to **roles**; roles assigned to company users; users may have several roles. No direct user-specific permissions. All authorization is enforced in application services and supported by company-scoped database foreign keys. System roles are company-admin, company-accountant, company-reader and company-operator; custom roles remain possible.

## Access sequence

1. Validate session token, expiration, current password version, and active user/company.
2. Derive `actor.companyId` from the session—not a request body or URL.
3. Check the named permission through live company-owned role assignments.
4. Check the requested business record belongs to that same company; no cross-company references.
5. Validate domain invariants and execute atomically with audit.

`companies`, `users`, `roles`, finance and business records have immutable ownership or scoped constraints. Tests cover direct SQL attempts, cross-company lookups, authorization changes, concurrency, and AI actions. SQLite `PRAGMA foreign_keys=ON` is mandatory. Audit rows are append-only for ordinary application writes but **not cryptographically tamper-evident** against database operators.

## Sessions, HTTP and operational boundaries

Passwords use salted scrypt; opaque random session tokens are stored by hash. The HTTP adapter sets HttpOnly/SameSite cookies, enforces CSRF on mutations, and uses `Secure` on HTTPS. Loopback HTTP is only for local development; LAN service requires a properly configured HTTPS proxy and real deployment review. Lockout throttling and password resets are available. Administrator recovery is a trusted local CLI operation only.

Read [identity API](../api/identity.md), [company data model](../domain/company-and-identity.md), and [release gates](../validation/release-gates.md).
