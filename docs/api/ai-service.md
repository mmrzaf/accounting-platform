# AI application service and HTTP adapter (implemented backend)

**Status:** This is a framework-independent SQLite-backed AI operations service with an authenticated HTTP adapter **mounted when `APP_AI_MASTER_KEY_BASE64` is configured**. A React assistant screen exists in source but its production build and live-provider acceptance have not passed. `src/modules/ai/service.ts` owns orchestration and approval; `src/modules/ai/tools.ts` owns typed service calls. The AI model never receives database access, a session token, or the provider API key.

## Construction and secret ownership

`createAiService(db, { masterKey, fetcher?, clock?, timeoutMs? })` requires a **random 32-byte encryption key** supplied by trusted operator configuration, separately from the SQLite database and backups. Use a persisted secure secret source in a real deployment; do not generate a new key on every restart. Losing the key makes encrypted provider credentials unusable. Do not log, send through CLI arguments, persist in a database, or commit the master key. Credential encryption uses AES-256-GCM with the company ID as associated data; rotation of the master key is a future operational requirement.

The authorized **company administrator** configures `baseUrl`, `model`, `apiKey`, `supportsTools`, and `enabled` with `configureProvider`. `getProvider` deliberately never returns plaintext credentials. Provider configuration is disabled until deliberately enabled. Only HTTPS URLs are permitted, except loopback HTTP for local model servers. Cross-host SSRF and deployment egress controls require host-level network policy in production.

## Use cases

| Service method | Scope | Description |
|---|---|---|
| `configureProvider` / `getProvider` | `ai.configure` (company) | Configure/redact AI connection |
| `setPolicy` | `ai.policy` (company) | Configure `autoDrafts` and `autoPost` |
| `getPolicy` | `ai.use` | Inspect company autonomy policy |
| `runTurn` | `ai.use` | Answer, run scoped read tools, or propose/execute **one mutation** |
| `getTurn` / `listTurns` | `ai.use` and requesting user | Read turn, proposal, preview, result |
| `approveAction` | `ai.execute` and same user | Execute exact proposal after fingerprint, expiry and permission checks |
| `rejectAction` | `ai.use` and same user | Reject pending proposal without side effects |

`runTurn` accepts `message`, a **caller-generated stable** `clientRequestId`, `companyId`, a session token, and `executionMode` of `review` (default) or `auto`. `executionMode` is supplied by a trusted, CSRF-protected user interaction, **never by the model**. Reusing the request ID with the same message returns the existing turn; changing the message/policy mode with that ID fails. In-flight requests may return `processing`; callers must inspect the turn rather than launch a second mutation. If a crash leaves `processing` status, no automatic replay occurs. Operator reconciliation and recovery are future operational work.

Provider credentials and the complete original user prompt are not saved in turn logs. A SHA-256 prompt fingerprint, provider response summary, typed operation preview, structured execution result, and bounded audit entries are persisted. This is **single-turn** orchestration; there is not yet persistent chat context, multi-action planning, async jobs, provider cost accounting, or data-retention management.

## Autonomy defaults

- Read-only tools (contacts, accounts, ledger/trial balance, invoices, payments) run automatically if the user possesses the underlying read permission.
- Draft creation (`create_contact`, `create_invoice`, `create_payment`) runs automatically **only** when `executionMode=auto`, `ai.execute` and corresponding business permissions are present, and `autoDrafts=true` (default).
- Posting and settlement (`post_invoice`, `post_payment`, `allocate_payment`) require a review by default. Auto-post requires **both** `executionMode=auto` for that request and company `autoPost=true`, with current posting permissions. Configuring it is a separate privileged company action.
- Every model-proposed mutation is strictly decoded, validated, persisted as a proposed action, and executed through the **existing trading service**; financial mutations are not generated directly by the model. Approval is tied to a SHA-256 action fingerprint and expires after 15 minutes.
- Administrative actions, period closing, reversals, arbitrary SQL, external bank transfers, arbitrary URLs, and privilege changes **do not have AI tools**.
- **Exactly one mutation per turn.** Read-only discovery may precede it; multi-step purchase-plus-payment execution is not atomic in this version and is *not* claimed as supported. The user may issue separate turns. A future explicit compound application use case should own combined financial transactions.

Approval/execution is atomic with the existing trading service's database transaction. Nested operations use SQLite savepoints inside the outer AI action transaction, so failure rolls back both the financial mutation and completion record. The failed outcome is separately audited without leaking credentials or raw model output. The database remains the authoritative financial source. Retry-safe domain request keys are derived from the persisted action ID, not chosen by the model.

## Provider capability and failure handling

The adapter uses OpenAI-compatible `POST {baseUrl}/chat/completions`, with optional `tools` and `tool_choice`. `supportsTools=false` limits the endpoint to general read-only text conversation without business tools. There is a configured request timeout (default 15s), response-size bound, a maximum of 4 tool rounds and 8 provider tool calls per round, and 20 new turns per user per rolling minute (HTTP 429 on excess). Malformed output and unknown tools fail closed. Provider HTTP errors are classified without copying provider error bodies into logs.

Only mock providers were used in the tests. Specific hosted/local endpoint compatibility, rate limiting, billing/cost measurement, multi-model capability negotiation, TLS certificates, network timeouts and production deployment **remain unverified**.

## HTTP adapter (conditionally mounted)

`createAiHttpHandler(identity, ai)` handles:

- `GET/PUT /api/ai/provider`
- `GET/PUT /api/ai/policy?companyId=<uuid>` (PUT receives the company ID in JSON)
- `GET/POST /api/ai/turns?companyId=<uuid>`
- `GET /api/ai/turns/<uuid>?companyId=<uuid>`
- `POST /api/ai/actions/<uuid>/approve` / `reject`

It uses the same cookie, CSRF token and same-origin policy as the existing identity handler. No bearer tokens in URL parameters, no public endpoint, no remote key disclosure. The Node server mounts it only when the master key is configured. For LAN access use a trusted-origin HTTPS reverse proxy; browser E2E and live-provider testing remain mandatory.
