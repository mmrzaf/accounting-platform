# UX and interaction foundation

**Principle:** calm, fast, predictable professional accounting with progressive disclosure. Excellent UX is not decorative UI.

## Shared shell

- Organization identity visible but not switchable by a user; company selector visible only when multiple authorized companies exist.
- Primary navigation by daily jobs: Overview / Sales / Purchases / Payments / Contacts / Accounting / Reports / Settings, filtered by permission.
- One unified search and keyboard navigation system for locating contacts, invoices, items, accounts, and commands.
- Home prioritizes actionable work, recent records, financial exceptions and shortcuts; avoid chart-heavy dashboards.

## Core interactions

- Default invoice creation: one coherent screen, intelligent defaults and a decisive 'Post invoice' action when approvals are off. 'Save draft' always available.
- Posting communicates permanence; allow correction through linked reversal/credit actions, not hidden mutable edit after posting.
- Payment allocation shows invoice balances, allocated/unallocated amount, currency and bank account. Prevent over-allocation unless treated explicitly as an advance.
- Accountant view may expose journal entries and advanced controls; ordinary users get business-language explanations.
- AI is available contextually in relevant modules and globally. It should present a concise operation summary, not a long chain of tool calls.
- Destructive/high-impact confirmation is precise: what will happen, affected company, amount and consequences; no repeated generic confirmation dialogs.

## RTL/LTR and internationalization

Use logical CSS properties, explicit text direction for mixed Persian/Latin IDs, Arabic/Persian digit shaping with machine-readable canonical values, clear Toman/Rial labels, correct tables and keyboard order. Jalali calendar presentation must not change persisted ISO dates. Build both languages from the first workflow; test zoom and narrow screens, browser locales and screen readers.

## Accessibility and usability gates

Keyboard-only paths for creation, search, table pagination and action menus; visible focus states; accessible error associations; no color-only status meaning; semantic tables. Test critical paths under slow storage/network and interrupted AI. Avoid loading flicker and accidental loss of unsaved edits.

## Research evidence required later

Prototype purchase+payment, journal inspection/correction, company switch (if applicable), and AI creation. Test with actual small-business accountant and non-accountant. Track time-on-task, errors, retracing, keyboard actions and confusion points rather than subjective visual ratings alone.
