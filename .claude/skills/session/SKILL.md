---
name: session
description: Run a ~2h Kut-Kut work session. Detects whether to draft a new session from the roadmap or continue an in-progress one. Use when the user says "start a session", "continue the session", or types /session. Optional argument — `new`, `continue`, or a session number (e.g. `/session 05`).
---

# /session — Kut-Kut work session

## 1. Load context

Read **only** these three files in parallel (skip any already in context):

- `CLAUDE.md`
- `plans/overview.md`
- The target session spec (resolved in §2).

**Do not read past session files.** The progress log in `plans/overview.md` is the canonical record of what each previous session shipped. If a detail about past work is genuinely needed, grep for the relevant code or ADR on demand — don't inhale old session specs into context.

ADRs under `plans/decisions/` and feature `CLAUDE.md`s under `apps/studio/src/features/` are read only when the current session spec points at them or the code you're editing lives in that feature directory.

## 2. Decide: draft or continue

A session is **in-progress** if its spec file has `Status: in-progress` OR has unchecked tasks without a superseding status.

**Argument handling:**

- No argument → autodetect. If any session is in-progress, continue the most recent one. Otherwise draft the next undone session from the roadmap in `plans/overview.md`.
- `new` or `next` → force draft of the next undone session.
- `continue` → force continue of the most recent in-progress session.
- A number (e.g. `05`) → target `session-05-*.md`. Continue if the file exists; draft if not.

State the decision in one line before doing work (e.g. _"Drafting session 13 — audio panel."_).

## 3a. If drafting

1. Read `plans/sessions/_template.md`.
2. From the roadmap table in `plans/overview.md`, identify the target row and derive a short kebab-case slug.
3. Copy the template to `plans/sessions/session-NN-<slug>.md`.
4. Fill in **Goal**, **Design**, **Tasks** (ordered, ≈15–45 min each), **Non-goals**, **Verification**. Set `Status: draft`. Link any relevant ADRs.
5. **Stop.** Summarize the drafted spec in 2–3 lines and ask the user to approve scope. **Do not write implementation code in this step.**

## 3b. If continuing

1. Read the session spec.
2. Reconcile the spec against disk. Use `Glob`/`Read` on files the spec's tasks touch. Mark already-completed tasks `[x]`.
3. If reality has drifted from the spec's Design, **do not paper over it.** Edit the spec to match reality and confirm with the user before proceeding.
4. Set `Status: in-progress` if needed and pick up at the first unchecked task.

## 4. Session discipline

- **Thin specs.** Session specs are procedural (what to do, in order). Rationale belongs in an ADR. If a Design section runs past ~60 lines, move the why into `plans/decisions/`.
- **Non-goals matter.** Every spec has them. They're what stop scope creep mid-session.
- **Spec ≠ reality.** If reality demands a change, edit the spec. Don't silently deviate.
- **Research delegation.** When investigating something that spans several files, use an Explore / general-purpose subagent and take its summary. Inhaling files into the main thread burns the context the session needs for implementation.

## 5. Tests and reviews — use sub-agents

- **Tests.** Do not run `bun test` / `bun run typecheck` / `bun run lint` in the main thread. Spawn the `test-runner` sub-agent. This keeps verbose test output out of the session's context.
- **Code review.** At wrap-up, before marking the session done, spawn the `code-reviewer` sub-agent. Address its findings (or justify ignoring them) before closing.

## 6. Honor the rhythm

- ~2h scope. If a task balloons, split it and push the overflow into the next session instead of expanding the current spec.
- When all tasks are done (or the user says "wrap up"):
  - Spawn `code-reviewer`; address findings.
  - Spawn `test-runner`; confirm green.
  - In `plans/overview.md`: append a one-line entry to the **Progress log** (`- **NN** (YYYY-MM-DD) <slug>: <what shipped> → ADR nnnn if any`). Update the **Current state** paragraph if new capabilities came online. Update the **Last updated** header.
  - If a recurring mistake was uncovered, append an entry to `plans/learnings.md`.
  - Set `Status: done` in the session spec.
  - Session files are a record of the plan. **Do not add an Outcome section** — the progress log is where shipped work is captured.
