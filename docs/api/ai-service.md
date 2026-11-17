# AI assistant — application service and HTTP contract

**Implementation: source present; not yet installed, compiled, exercised, or release-certified for this milestone.** The company-only schema is in `migrations/0001_initial.sql`. It is a fresh-product baseline; there are no legacy migrations or compatibility adapters.

## Architecture

The assistant is an **optional, authorized interface to the same accounting/trading services used by the manual UI**, not a parallel ledger. `src/modules/ai/service.ts` owns persisted conversations, provider orchestration, user-scoped actions, policy and audit. `tools.ts` declares/validates operations and delegates to accounting and trading. `context.ts` checks any record selected in the UI against current company and read permissions. `presentation.ts` generates deterministic operation previews and links. The service is independent of React. The HTTP adapter is `src/platform/http/ai-handler.ts`, mounted only when `APP_AI_MASTER_KEY_BASE64` is present.

A user belongs to exactly one company. The session resolves that company; no company picker, tenant slug, tenant token, or cross-company assistant. Conversation history belongs to the signed-in **user**, not all company staff. The model receives neither the user's session token nor database connections or provider credentials.

## Provider and secrets

- The operator supplies a persistent random 32-byte master key via `APP_AI_MASTER_KEY_BASE64` outside source control; losing it prevents decryption of saved credentials. The key must be protected separately from backups.
- A company administrator configures an OpenAI-compatible base URL, model, encrypted API key, tool-support flag and enabled status under Settings → AI. GET never exposes the API key. HTTPS is required except for local loopback endpoints.
- A company administrator sets `autoDrafts` (default `true`) and `autoPost` (default `false`). Enabling either does **not** grant privileges beyond the invoking user's roles. The per-turn `executionMode` must also be `auto` to execute without review. Providers with no tool-calling support can answer general text but cannot perform business operations.
- Read tools transmit permitted, bounded records to the configured provider. The interface discloses this privacy boundary. External provider storage/retention, egress filtering, budgets and production security review require separate acceptance.

## Operations

Read-only tools: `list_contacts`, `get_contact`, `list_accounts`, `financial_summary`, `trial_balance`, `general_ledger`, `list_invoices`, `get_invoice`, `list_payments`, `get_payment`.

Existing controlled business tools: `create_contact`, `create_invoice`, `post_invoice`, `create_payment`, `post_payment`, `allocate_payment`.

New atomic commands:

- `record_trade`: record and post a **non-stock sale or purchase**, with optional immediate recorded receipt/payment and allocation to that invoice. It uses company posting defaults. One validated outer SQLite transaction commits or rolls back the complete operation. The user-visible preview shows lines, exact totals, amount paid and balance remaining.
- `record_settlement`: record/post a receipt or payment and, if given an existing posted invoice, allocate as much of the recorded amount as eligible. Any remaining payment stays unapplied. This only **records** an already-occurring payment; it does not initiate an external bank transfer.

The model may use up to five read/discovery rounds and then propose **one application command per turn**. This is not a general-purpose autonomous agent, unlimited planner, or arbitrary sequence of independent financial writes. Atomic compound commands cover important common workflows without fragile chains of model-controlled journal writes. Currency amounts are exact minor-unit strings; dates are ISO calendar dates. IRR↔Toman must be explicitly converted; do not assume all display amounts are IRR. No inventory valuation, FX settlement, tax posting, general bank integration, period closing, reversals, bulk corrections or unrestricted SQL is exposed to AI.

## Conversation behavior

- `createConversation`, `listConversations`, `getConversation`, `archiveConversation`: durable company/user-scoped threads.
- `runTurn`: accept `message`, stable `clientRequestId`, optional `conversationId`, validated page/record context and `executionMode`. Idempotent replays return the original result; conflicting reuse fails.
- `getTurn`, `listTurns`: inspect status, user message, reply, safe action preview, action state and record links. User prompts **are persisted** as conversation history, and a bounded portion is transmitted to the configured model. Do not falsely claim otherwise.
- `approveAction`, `rejectAction`: fingerprint-bound exact proposal, same user and current company, permission recheck, 15-minute expiration. Approval calls validated application services inside transaction and records audited outcome; rejection makes no financial change.
- Prior successful operation IDs (and only generated application record identifiers) are reintroduced into the next model context, allowing follow-ups such as “What remains due on that invoice?” without inventing IDs. Selected-page context is validated against company and read permission before use. Record details must be queried using the corresponding authorized tool.
- Turns are limited to 20 new requests per user per rolling minute. Tool payload, result and provider response sizes are bounded. Read-only discovery is permission-filtered. One pending tool approval per conversation blocks overlapping operations. A provider timeout has no business side effects before a command is accepted.

**Unfinished failure path:** An interrupted provider request can leave a `processing` turn in the database. Automated stale-turn reconciliation and operator recovery, privacy retention/erasure policy, provider cost budgets, real-world currency ambiguity acceptance and live endpoint certification belong to Milestone 5; never automatically replay an uncertain financial command.

## HTTP surface

Authenticated, cookie/CSRF/same-origin restricted; company always comes from the server session:

| Method | Endpoint | Purpose |
|---|---|---|
| GET / PUT | `/api/ai/provider` | Redacted configuration / configure provider (admin) |
| GET / PUT | `/api/ai/policy` | Read / configure AI autonomy policy |
| GET / POST | `/api/ai/conversations` | List / create conversations |
| GET / DELETE | `/api/ai/conversations/:id` | Conversation detail with turns / archive |
| GET / POST | `/api/ai/turns` | List recent turns / send a turn |
| GET | `/api/ai/turns/:id` | Fetch single turn and safe preview |
| POST | `/api/ai/actions/:id/approve` | Execute fingerprint-bound proposal |
| POST | `/api/ai/actions/:id/reject` | Cancel pending proposal |

All mutation requests use CSRF tokens and permission checks. Existing record tools enforce company scope; client-provided IDs or page context do not constitute authority. Source implementation is not evidence of browser execution until Milestone 5 acceptance is performed.
