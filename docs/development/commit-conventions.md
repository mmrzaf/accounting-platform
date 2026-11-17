# Commit and history conventions

Use coherent, small **Conventional Commits** rather than commits named for project phases.

```
feat(identity): implement company-scoped roles
fix(http): reject untrusted session overrides
test(security): cover cross-company access
refactor(identity): isolate session lifecycle
docs(architecture): define module boundaries
chore(ci): test supported Node release lines
```

- One commit should express a single purpose, with related tests where possible.
- Avoid mixing schema migrations, UI changes and unrelated refactors in the same commit.
- Make deliberate, visible breaking decisions in an architecture record.
- Use local repository author settings only: `mmrzaf <mohammr.farkhonde12@sharif.edu>`.
- Use `npm run verify`, `git diff --check`, and a clean working tree before handoff.
- This correction intentionally starts a **new Git history**; original archives remain separate. Git commit timestamps may reflect the reconstruction operation and do not claim historical provenance.
