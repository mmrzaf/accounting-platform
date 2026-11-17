# Contextual assistant UX contract

**Source implemented; visual, keyboard, screen reader and live-provider acceptance deferred to Milestone 5.**

## Entry points

The assistant has two presentations of the **same user-owned conversation service**:

1. A full workspace at `/assistant` with a list of recent conversations and transcript.
2. A contextual side panel opened from the header or the relevant overview, contact, invoice, payment or ledger workspace. It uses the same conversation list, execution controls and operation previews.

Opening AI from a record supplies the current page and a validated record reference. The server verifies current company ownership and read permissions, rather than trusting the route or DOM. No company selector, tenant ID, raw backend tool name, JSON execution payload or database UUID belongs in visible chat content.

## Expected interaction

- Conversation history is persisted; selecting an existing conversation restores earlier turns. New conversation starts empty. Archive hides a conversation but does not delete any financial/audit records.
- The composer supports normal-language Persian or English, Enter to send, Shift+Enter for multiline input, clear processing/error states and prompts that communicate supported work.
- Read-only questions get concise, sourced-from-tools answers. Missing contacts/accounts or ambiguous transactions should produce a single targeted clarification.
- Write operations appear as readable cards with title, counterparty, date, item descriptions, quantities, currency, total, payment and outstanding balance. Posted results link directly to their contact, invoice or payment details.
- Company and user permissions control automatic execution. A per-turn “run permitted actions automatically” switch can request auto, but cannot override the company policy. High-risk/unimplemented actions must remain unavailable.
- The assistant discloses that necessary records can be sent to the configured provider, and that recording bookkeeping payments never initiates bank transfers.

## First real-world acceptance tasks

1. From a contact detail, ask “What have we sold this customer?” and verify only authorized company documents are shown.
2. From an invoice, ask “How much is still outstanding?” and verify the **selected invoice** is used rather than a guessed document.
3. Ask for a purchase with two non-stock lines and a partial payment: confirm currency conversion, account defaults, all postings, allocation and resulting outstanding amount.
4. Ask for a follow-up in the same conversation: “Show me the invoice you just created.” Verify application-verified record IDs are carried through, not imagined.
5. Try a user with only read permission and ensure no mutation tool is offered or callable.
6. Try a different-company record ID; confirm fail-closed. Revoke the user's posting role after proposal and verify approval fails.
7. Test provider timeout, malformed tool JSON, conflicting idempotency key, expired approval and interrupted request; no duplicate journal may be created.
8. Review narrow desktop/mobile layouts, RTL Persian numeric alignment, keyboard focus inside the drawer, accessibility announcements and provider-disabled states.

No part of this document is a claim that these tasks were executed. They are required **Milestone 5** acceptance gates.
