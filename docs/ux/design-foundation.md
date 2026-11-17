# UX and localization foundation

The **actual browser client** lives in `web/`, with its styles in `web/src/styles.css`, screens in `web/src/pages/`, and locale strings in `web/src/lib/i18n.ts`. Do not create a second unused design-token stylesheet. Neutral surfaces, accessible focus outlines, reduced-motion preferences, small-screen tables and RTL direction are implemented in source; **they have not passed real browser testing**.

`src/ui/i18n/locale.ts` provides independent Persian/English exact-integer formatting and Gregorian/Jalali presentation through `Intl`. Database dates and amounts are always canonical, never localized strings. Rial-to-Toman conversion must be explicit. The browser monetary input utilities are in `web/src/lib/api.ts`; do not let them replace server-side validation.

The client supports both Persian and English sign-in and shell layouts. Current browser date inputs are Gregorian-native, not a verified Jalali picker. Keyboard, screen-reader, mobile, and cross-browser acceptance remain mandatory. A correct-looking screen is not evidence of correct accounting workflows.
