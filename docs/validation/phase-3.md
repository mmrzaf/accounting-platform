> **Historical snapshot:** This file describes the earlier phase-3 delivery. The corrected all-TypeScript repository, current lockfile and verification evidence are described in [TypeScript reconstruction](typescript-reconstruction.md).

# Phase 3 — identity, organizations, companies and authorization

- **Status:** Executable identity/security foundation delivered; production web application integration **blocked** (no package registry access). **Not production-ready.**
- **Tested:** Linux with Node 22.16.0 using built-in `node:sqlite`, `node:crypto`, `node:test`. `npm run verify` checks historical and new tests.
- **Node policy:** 24 primary, 22.16+ and 26 compatibility targets. Actual 24/26 and Windows/macOS runs pending.

## Scope delivered

1. `0002_identity_access.sql`: organizations, optional multiple companies, users, role definitions, permission registry, company/organization role assignments, sessions, login lockout records and append-only security audit. Composite foreign keys and immutability triggers reject cross-organization ownership changes. Default bootstrap creates **one** company; additional companies are explicit.
2. `createIdentityService`: atomic organization bootstrap; local password login; session issue/revoke; password change/admin reset; user create/disable/unlock; company create/list; scoped role creation/assignment/revocation; audit viewing; immediate permission checks. The **last active organization administrator** cannot be disabled or stripped of the admin role.
3. `createIdentityHttpHandler`: framework-neutral Web `Request`/`Response` endpoint adapter. Secure cookies outside loopback, same-origin/Fetch-Metadata checks, CSRF for mutations, no-store responses, size-limited JSON, role checks inside application services. **Not mounted on a production server**.
4. CLI bootstrap `organization:bootstrap` and local-operator `admin:recover`. Passwords read from a non-echoing interactive prompt or `--password-stdin` pipe; neither accepts a `--password` argument. Recovery is deliberately **not exposed via HTTP/AI**.
5. Security tests: isolation, wrong-scope grants, concurrent duplicate user attempts, password hashes, login lockout, session invalidation, last admin protection, audit immutability, HTTP authentication/CSRF, CLI secret handling, recovery and ownership migration rejection.

## Actual verification / limitations

- Offline suite on Linux Node 22.16: `npm run verify`; inspect current test totals in the local run log, not a hardcoded guarantee.
- `node:sqlite` is experimental in the tested Node 22 runtime. `better-sqlite3` vs `node:sqlite` still requires the Phase 1 dependency/build investigation. **No Drizzle integration has occurred.**
- The new runtime source is standard-library ESM JavaScript (`.ts`) for offline execution. Converting these modules to checked strict TypeScript is an explicit requirement once the supported build/runtime toolchain is installed.
- No TanStack Start routes, login screens, admin UI, SSR session integration or browser E2E tests exist yet; the UI is **not** finished.
- App authentication routes are a request/response adapter, not an independently deployed HTTPS server. The deployment adapter must use a trusted configured origin, terminate TLS for LAN mode, and must not trust a raw `Host`/`X-Forwarded-*` header.
- Account-based lockout is present, but **network/IP throttling, session pruning, credential policies, abuse monitoring and real browser security review** are pending before production.
- The security audit is append-only to ordinary SQL writes (triggers), **not cryptographically tamper-evident** against a privileged filesystem/database operator. Audit retention policy remains pending.
- The backup mechanism still covers SQLite only. Attachments are out of scope until storage is implemented.
- Organization → multiple-company schema remains a **provisional extensibility design** (D-05 pending). The first company is created during bootstrap; no company switching UI or cross-company accounting exists.

## Exit gates for framework integration

1. Pin, install and verify TanStack Start + React + Drizzle + UI packages with a frozen lockfile; connect the actual server handlers, session cookies and CSRF integration.
2. Run real production builds and API/browser tests on Node 22, 24, 26 and Windows/macOS/Linux; test LAN HTTPS and trusted proxy configuration.
3. Verify production key management, backup restore with identities, file permissions, session rotation and password reset journeys.
4. Validate authorization on actual future accounting and AI use cases (tests today cover identity endpoints only).

**No accounting transactions or financial records were implemented.**
