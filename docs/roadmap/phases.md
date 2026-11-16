# Incremental implementation roadmap and exit gates

**No feature implementation is authorized by Phase 0/1 work alone.** Each phase is a reviewable checkpoint and must produce a reproducible archive with Git history and clear status.

| Phase | Objective | Exit gate |
|---|---|---|
| 0 | Product decisions, boundaries, accounting/security/AI/UX baseline | Documents, explicit status register, unresolved decisions visible |
| 1 | Technical feasibility | Environment checks, focused probes, evidence matrix, documented blockers and next tests |
| 2 | Engineering foundation | CLI, configuration, migrations, recovery primitives, CI and UX tokens **implemented offline**; routing/build, pnpm dependency lock and runtime matrix **pending external validation** |
| 3 | Identity, organizations & companies | Offline services, bootstrap and negative isolation tests delivered; real TanStack/UI integration pending |
| 4 | Accounting engine | Exact arithmetic, journals, posting, reversal, periods, reports reconcile |
| 5 | First business journeys | Purchase/sale/invoice/settlement end to end with accounting correctness |
| 6 | AI operations | Typed service calls with authorization, policy, idempotency and audit |
| 7 | Remaining first-release features | Reports, returns, attachments, imports, optional inventory |
| 8 | Hardening and pilot | Security, accessibility, real pilot, backup restore and cross-platform pass |

## Increment discipline

Each vertical slice includes schema, domain behavior, use case, transport adapter, UI, permission checks, accounting integration, tests and documentation where relevant. Avoid bulk building many route screens before a complete posting journey works.

## Phase 0 caveat

An architecture baseline can be *document-complete* without being *fully approved*. PENDING entries must be signed off before irreversible schema/code decisions. Phase 1 can report partial technical proof without claiming a production-ready stack.

## Archive convention

Each phase generates a full Git repository archive (`.git` included): `.tar.gz` for Phases 0–2 and `.zip` from Phase 3 as requested, signed-off or pending notes, and reproducible verification steps. Commit identity is set locally to the supplied author; no global Git config changes required.
