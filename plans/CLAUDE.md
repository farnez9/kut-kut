# plans/

This folder is the project's roadmap and session ledger. Read `overview.md` first when context is unclear.

## Structure

- `overview.md` — master plan: product statement, architecture, stack, session roadmap, performance budgets, open questions.
- `sessions/` — one `.md` per working session. Naming: `session-NN-short-slug.md`. Start from `_template.md`.
- `decisions/` — ADR-style notes for non-obvious architectural choices. Naming: `NNNN-short-slug.md`.

## Session lifecycle

1. **Draft** (before coding): copy `_template.md`, fill Goal / Design / Tasks / Non-goals / Verification. Confirm scope with the user.
2. **Execute** (during the ~2h session): walk the tasks in order. If a task balloons, split it and push the overflow into the next session rather than expanding the current one.
3. **Close** (end of session): fill the Outcome section (what shipped, what deferred, surprises, follow-ups). If the roadmap changed, update `overview.md` in the same pass.

## Scope rules

- A session spec is ~2h of focused engineering. If a spec keeps growing, split it.
- Non-goals matter as much as goals — list them explicitly, they protect the session from creep.
- If a design decision will outlive the session, write an ADR in `decisions/` and link it from the spec.
- Never silently deviate from a spec. If reality demands a change, edit the spec (and note why in Outcome).
