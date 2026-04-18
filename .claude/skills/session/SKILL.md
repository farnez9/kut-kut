---
name: session
description: Run a ~2h Kut-Kut work session. Detects whether to draft a new session from the roadmap or continue an in-progress one. Use when the user says "start a session", "continue the session", or types /session. Optional argument — `new`, `continue`, or a session number (e.g. `/session 05`).
---

# /session — Kut-Kut work session

## 1. Load context

Read in parallel (skip any already in context):

- `CLAUDE.md`
- `plans/overview.md`
- `plans/CLAUDE.md`

## 2. Decide: draft or continue

A session is **in-progress** if its spec file has `Status: in-progress`, OR has unchecked tasks AND its Outcome section still reads `_Filled at session end._`.

**Argument handling:**

- No argument → autodetect. If any session is in-progress, continue the most recent one. Otherwise draft the next undone session from the roadmap in `plans/overview.md`.
- `new` or `next` → force draft of the next undone session.
- `continue` → force continue of the most recent in-progress session.
- A number (e.g. `05`) → target `session-05-*.md`. If the file exists, continue it; if not, draft a new spec with that number.

State the decision in one line before doing work (e.g. _"Drafting session 07 — interactive timeline."_).

## 3a. If drafting

1. Read `plans/sessions/_template.md`.
2. From the roadmap table in `plans/overview.md`, identify the target row and derive a short kebab-case slug.
3. Copy the template to `plans/sessions/session-NN-<slug>.md`.
4. Fill in **Goal**, **Design**, **Tasks** (ordered, ≈15–45 min each), **Non-goals**, **Verification**. Set `Status: draft`. Link any relevant ADRs from `plans/decisions/`.
5. **Stop.** Summarize the drafted spec in 2–3 lines and ask the user to approve the scope. **Do not write implementation code in this step.**

## 3b. If continuing

1. Read the session spec file.
2. Reconcile the spec against current disk state: use `Glob`/`Read` on the files the spec's tasks touch. Mark already-completed tasks `[x]` inside the file.
3. If reality has drifted from the spec's Design (different paths, different shapes), **do not paper over it.** Edit the spec to match reality, note the change in Outcome → Surprises, and confirm with the user before proceeding.
4. Otherwise, set `Status: in-progress` if it isn't already, pick up at the first unchecked task, and proceed.

## 4. Honor the rhythm

- ~2h scope. If a task is ballooning, split and push the overflow into the next session rather than expanding the current spec.
- Before marking implementation tasks `[x]`, verify with `bun test` / `bun run typecheck` / `bun run lint` where applicable.
- When all tasks are done (or the user says "wrap up"):
  - Fill the Outcome section (Shipped, Deferred, Surprises, Follow-ups).
  - Update `plans/overview.md` if the roadmap shifted.
  - Set `Status: done`.
