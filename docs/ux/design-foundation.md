# UI design foundation — Phase 2

`src/ui/styles/tokens.css` establishes neutral light/dark colors, readable text contrast candidates, spacing, form heights, focus rings, and reduced-motion behavior. Tokens are provisional until tested with actual components, including a shadcn/ui integration.

`src/ui/i18n/locale.ts` implements locale direction, exact BigInt integer/money presentation, and Jalali/Gregorian date formatting via `Intl`. Localized strings are not database representations. Rial-to-Toman conversions **must be explicit operations**, never silent formatting side effects.

`experiments/ux-preview/ux-preview.html` is an *offline test fixture*, not an app or proposed final transaction screen. It permits manual RTL/LTR comparison without network or dependencies. It deliberately avoids a dashboard and focuses on form labels, mixed-direction amounts, keyboard focus, table readability and responsive widths.

Next UI gate: install React/TanStack Start, verify SSR/hydration, implement accessible primitive inputs/menus/modals, test RTL keyboard navigation, contrast, screen-reader semantics, dark mode, error/empty states and dense accountant tables. No UI quality claim is based on the fixture alone.
