# Focused open decisions

The following must be decided before data-model implementation; none should become an accidental assumption.

1. **Multiple companies:** One organization can hold multiple legal companies (current working model) or one company? The latest plan assumed multiple; the earlier numbered response was not unambiguous. Recommend multiple only if users actually need one login across companies.
2. **Accounting recognition:** For the initial release, do sales and purchase invoices post immediately on finalization, or does the accountant need an optional review policy? Recommend direct post by authorized staff and optional higher-risk approval.
3. **Accounting periods:** Whether fiscal years may be initially opened with imported prior balances and how closed-period adjustments are recorded. Recommend reversal/adjustment in open period unless a privileged audited reopening is performed.
4. **FX:** Rate source and default rate date, rate locking, treatment of advances, revaluation scope, and rounding rules. Recommend explicit rate at posting and current-period differences at settlement; revaluation as a later controlled workflow if not release 1.
5. **Inventory:** Does first release require monetary COGS or only quantities? Recommend simple weighted average only if stock valuation is needed; no inventory for service-only companies.
6. **AI autonomy:** Which exact actions can auto-execute, maximum monetary threshold if any, and whether background/unsupervised execution is allowed? Recommend immediate execution for unambiguous, user-initiated routine operations, but no unattended bulk posting in first release.
7. **Company roles:** Are organization administrators allowed to inspect all companies by default? Recommend yes only for explicit administrator role; other grants company-scoped.
8. **Backup objective:** Proposed RPO <= 1 hour and RTO <= 4 hours for pilot; confirm based on operational reality and test restore procedure.

Low-impact choices (icons, route paths, naming of internal classes) should not block implementation approval.
