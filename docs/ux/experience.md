# User experience principles

One user works in exactly one company; **there is never a company or tenant selector**. Sign-in requires a username and password. The company label, when shown, is informational. The UI is intended for ordinary business operators and accountants working in a small company.

- Organize navigation around work: contacts, sales/purchases, receipts/payments, accounting and reports.
- Everyday transactions should be completed in one controlled action. Draft workflows remain available for review and correction.
- Configure posting accounts once in Settings. Debits/credits remain inspectable, but ordinary invoice and payment forms do not ask for those account IDs.
- Maintain document context: search, inspect status, drill into line items and balances, post or reverse using consistent actions.
- Present dense, readable financial tables with precise dates, exact money, filters and running balances.
- Use clear, localized errors; preserve user input after failures; disable duplicates while saving.
- Support Persian RTL and English LTR, mixed-direction numbers, accessible focus, reduced motion and practical mobile layouts.
- Expose AI in context, but don't present raw internal tools as the business-facing interaction model. Full contextual AI remains future work.

The source includes core UI components, not a certification of usability. Acceptance requires actual browser build, desktop/mobile interaction review, RTL/LTR and keyboard/E2E testing.
