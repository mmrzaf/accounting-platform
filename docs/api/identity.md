# Identity HTTP API

The live backend mounts `src/platform/http/identity-handler.ts`. Login accepts **only `{ username, password }`**; no company slug or selector. The response sets an HttpOnly cookie. `GET /api/auth/session` returns `{ user, company, csrfToken }`; the company is a static identity label, not selectable.

| Method | Path | Authorization / behavior |
|---|---|---|
| POST | `/api/auth/login` | Anonymous credentials; session cookie; no company ID in input |
| GET | `/api/auth/session` | Authenticated current user and company |
| POST | `/api/auth/logout` | Session + CSRF; revoke current session |
| POST | `/api/auth/password` | Current password required; revokes sessions |
| GET | `/api/company` | `company.read`; own company only |
| PATCH | `/api/company` | `company.manage`; rename own company only |
| GET / POST | `/api/users` | `users.read` / `users.manage` for the user's company |
| PATCH | `/api/users/:id/status` | `users.manage`, last admin protected |
| POST | `/api/users/:id/reset-password` | `users.manage`, revoke sessions |
| POST | `/api/users/:id/unlock` | `users.manage` |
| GET / POST | `/api/roles` | Company roles; read/manage permissions |
| POST | `/api/roles/assign` | `roles.manage`; company user and role IDs only |
| POST | `/api/roles/revoke` | `roles.manage`; last admin protected |
| GET | `/api/roles/assignments?userId=...` | Own company only |
| GET | `/api/audit?limit=50` | `audit.read`; bounded pagination |

Mutations require same-origin validation, JSON Content-Type, an authenticated session (except login) and `X-CSRF-Token`. Default 16 KiB JSON body limit. Error shape: `{ error: { code, message }, requestId }` with standard 400/401/403/404/409/500 codes. Credentials, tokens and hashes never appear in response JSON or logs. No public registration or company creation HTTP endpoint. Company creation is trusted CLI-only.
