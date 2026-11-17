# AI operating model and autonomy policy

**Implementation status:** [The AI application service and tool contracts](../api/ai-service.md) implement a deliberately bounded, single-turn subset of this product vision. Compound workflows and more advanced autonomous planning remain design goals, not currently shipped behavior.

**Confirmed product direction:** high autonomy. AI is a primary operational interface, not merely a chatbot; it must still work through validated application services with the exact user identity/permissions of the request.

## Boundaries

- AI is optional and provider-agnostic through configurable OpenAI-compatible APIs. No provider network dependency for core operations.
- Model output is untrusted interpretation, never the ledger itself. It may propose typed application commands only; services validate and commit.
- Model tools are individually authorized, scoped by organization/company, bounded in query size, and rate-limited.
- No unrestricted SQL access, privileged service credentials, arbitrary filesystem actions, or bypass of document/period policy.
- Models receive minimum necessary information. Tenant administrator explicitly configures outbound model connection and accepts sensitivity risks.

## Risk tiers (proposed)

| Tier | Example | Default policy |
|---|---|---|
| Read | Find ledger, explain invoices, prepare report | Automatic if role permits |
| Draft | Create contact, draft invoice, update unposted fields | Automatic with auditability |
| Routine financial | Explicit user request to post unambiguous invoice or record payment **in-app** | Automatic if allowed by configured policy, with final validation and clear outcome |
| High impact | Bulk posting, write-off, reversals, period close/reopen, permission changes | Require explicit confirmation and privileges; some operations require human-only control |

Autonomy levels must not grant authority beyond the invoking user's permissions. A user request to 'pay' means **record a payment** in the accounting app, not initiate an external bank transfer unless a separately approved integration exists.

## Example AI execution

**Target workflow, not yet supported as one atomic AI command:** User: 'Bought 20 units from Ali for 50 million toman, paid 20, rest due.' Identify supplier, item, currency denomination and bank account; ask targeted question only if ambiguous. Build `CreatePurchase` and `RecordPayment` commands; run deterministic validation and permission/risk policy. Execute with idempotency and transaction ownership. Respond with posted document numbers, amount owed and any pending actions; do not claim external money transfer.

## Orchestration essentials

Use structured tool contracts and schema validation; keep model-provider adapter separate from service contracts. Correlate chat turn, command proposal, confirmation (if needed), execution ID, audit event and final result. Handle timeouts as **unknown outcome** until checked against idempotency key; never blindly retry a financial mutation. Bound agent recursion, tool calls, context windows and costs. If provider is unavailable, manual workflow remains complete.

## Future decisions

Whether a model can initiate work without an explicit current user command; monetary thresholds, who configures them, high-impact action list, model data retention policy, message retention/erasure, and cross-company access semantics. Unattended recurring financial mutations remain excluded from v1 until explicitly approved.
