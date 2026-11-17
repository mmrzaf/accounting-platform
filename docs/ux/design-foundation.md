# UX and localization foundation

`src/ui/styles/tokens.css` defines neutral light/dark colors, spacing, focus and reduced-motion tokens. These are **design inputs only**, not evidence of a functioning application UI.

`src/ui/i18n/locale.ts` handles Persian/English direction, formatting of exact BigInt monetary amounts, and Gregorian/Jalali date presentation using `Intl`. Canonical database dates and currency amounts are not stored in localized display form. Any Rial-to-Toman conversion must be explicit.

**Unimplemented:** actual React screens, navigation, forms, accessible dialogs and tables, invoice and settlement workflows, responsive RTL/LTR testing, keyboard and screen-reader acceptance, and browser E2E. The final UI must be designed around real accounting workflows—not decorative dashboards.
