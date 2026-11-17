# AI autonomy and trust boundaries

The assistant is a real user-facing business operator **for supported workflows**, not an independent accounting engine. It is optional: every core financial workflow must also work manually.

## Rules

- One company per user; AI inherits the signed-in user and current permissions, never a system-wide identity.
- The assistant can search and explain authorized financial information without confirmation. Model-generated text and returned business data are not trusted instructions.
- Business changes are validated by application services. Model tool arguments are parsed, schema-validated and permission checked. Journals and monetary arithmetic are never directly controlled by model output.
- The current supported compound command records a non-stock purchase or sale, optionally posts a part-payment/receipt and allocates it **atomically**. A separate command records a payment/receipt and optional invoice settlement. The assistant can also create contact and draft records and post existing drafts.
- One business command may be proposed per model turn after a bounded series of read-tool calls; there is **no generic multi-action autonomous planner** yet. Unimplemented financial actions must not be portrayed as supported.
- Read-only tools run automatically for authorized users. Draft commands run without a second confirmation only when company `autoDrafts=true` and the user chose automatic execution. Financial commands require review by default; execution without a second confirmation requires the company `autoPost=true`, explicit current-turn auto mode, and posting permissions.
- A pending proposal shows the counterparty, dates, items, amounts, allocation and expected remaining balance in business language. The user may approve or reject; the executed result links to the real document.
- Creation of a bookkeeping payment does **not** transfer money outside the application. The assistant cannot change roles, execute arbitrary SQL, reverse journals, close periods or send bank transfers.

## Example business journey

> “I bought 20 units from Ali for 50 million Toman and paid 20 million from Mellat; the rest is due.”

The assistant searches **this company's** contacts and accounts, clarifies if “Ali” or “Mellat” is ambiguous, determines the exact base-currency minor-unit amounts, and proposes `record_trade` with the invoice and partial recorded payment. It shows the 50 million Toman total, 20 million recorded payment, and 30 million remaining. If auto posting is allowed it may execute immediately; otherwise it asks to confirm once. The result contains links to the posted invoice and payment. The ledger entries are created by the existing accounting service, with a single transaction boundary and idempotency key.

**Important:** The model may misread a spoken currency or an implied date. Real-provider prompt handling, quantity/rounding interpretation, amount comparisons and a complete end-to-end demo using this case must pass Milestone 5 acceptance before real financial data is entrusted to the assistant.

## Conversation, privacy and recovery

- Conversations and user messages are persisted to SQLite, scoped to the owner and company. They are not ephemeral; archiving hides a thread but is **not deletion**.
- Bounded recent turns and application-verified record identifiers are sent to the provider to support follow-up questions. Tools retrieve only the data the user is authorized to read. The UI discloses that external-model processing may occur.
- Provider keys are encrypted separately from the database with an operator-controlled master key. Admins manage the provider within Settings; regular users cannot read it.
- Pending approvals expire after 15 minutes. Requests use persistent idempotency keys. Failure must never silently double-post. A crashed provider turn can remain pending and needs reconciliation—still a release-blocking operational gap.
- Provider cost budgets, consent/retention options, stale processing recovery (now implemented; runtime acceptance still required), live-provider capability checks, adversarial prompt injection checks and UI/browser E2E are Milestone 5 acceptance requirements.

See [service contract](../api/ai-service.md) and [AI UX](../ux/assistant-workspace.md).
