# Identity HTTP contract

The framework-neutral handler is in `src/platform/http/identity-handler.ts`. It returns standard Web `Response` objects. **These routes are not yet mounted on TanStack Start or exposed by a live web server.** Mounting must use a trusted configured origin; do not turn user-provided `Host`/forwarding headers into the request URL. See [bootstrap and security](../operations/identity-bootstrap.md).

| Method | Path | Permission / behavior |
|---|---|---|
| POST | `/api/auth/login` | Anonymous credential verification; sets HttpOnly session cookie, returns CSRF token |
| GET | `/api/auth/session` | Active session; returns user, organization, CSRF token |
| POST | `/api/auth/logout` | Session + CSRF; revokes current session |
| POST | `/api/auth/password` | Session + CSRF; verifies old password, revokes all sessions |
| GET | `/api/companies` | Session; company list filtered by organization-level `companies.read` or specific `company.read` roles |
| POST | `/api/companies` | `companies.manage`; automatically grants creator company-admin |
| GET | `/api/users` | `users.read`; organization users only, excludes password hashes |
| POST | `/api/users` | `users.manage`; initial user has no roles |
| PATCH | `/api/users/:id/status` | `users.manage`; last active admin cannot be disabled |
| POST | `/api/users/:id/reset-password` | `users.manage`; revokes sessions and lockout |
| POST | `/api/users/:id/unlock` | `users.manage`; clears account lockout |
| GET | `/api/roles` | `users.read`; organization roles only |
| POST | `/api/roles` | `roles.manage`; permissions must match role scope |
| POST | `/api/roles/assign` | `roles.manage`; scope and company membership validated |
| POST | `/api/roles/revoke` | `roles.manage`; last active admin protected |
| GET | `/api/roles/assignments?userId=...` | `users.read`; organization user only |
| GET | `/api/audit?limit=50` | `audit.read`; max 200 records, organization only |

Mutating endpoints require `Content-Type: application/json`, a current session cookie (except login), matching origin and `X-CSRF-Token`. Body limit: 16 KiB. Cookie value is a random session token and is **not returned in JSON**. Session expiration is 12 hours. `SameSite=Strict`, `HttpOnly`, and `Secure` are used for HTTPS; insecure HTTP is only permitted on localhost/loopback for development. No cross-origin access is granted.

Error responses use `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`; validation 400, unauthenticated 401, forbidden 403, not found 404, conflict 409, unexpected 500. Detailed internal errors and secrets are not returned. Do not assume future finance endpoints inherit this enforcement automatically; call their own application services.
