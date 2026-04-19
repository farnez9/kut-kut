# plans/

Roadmap + session ledger. Read `overview.md` first when context is unclear.

- `overview.md` — roadmap table, product/architecture notes, open questions.
- `sessions/` — one `.md` per ~2h session. Start from `_template.md`.
- `decisions/` — ADRs for choices that outlive a single session.

## Session specs stay thin

Session files are **procedural** (what to do, in order). ADRs are **rationale** (why). If a Design section grows past ~60 lines, the rationale belongs in an ADR — not the spec. Every session continue re-reads the current spec; fat specs force compactions mid-session.

Outcome is bullets, not prose. The only future reader is a later session scanning for follow-ups.

Don't retroactively reformat old specs — they're history.

## Non-goals matter

List them explicitly in every spec. They're what stop scope creep.

## Spec ≠ reality

If reality demands a change, edit the spec (and note why in Outcome). Don't silently deviate.

## Research delegation

When investigating something that spans several files, use an Explore / general-purpose subagent and take its summary. Inhaling files into the main thread burns context that the session needs for implementation.
