# Kut-Kut

Local-first authoring tool for 2D and 3D animated videos. Scenes are code in this repo; a Solid.js studio served by Vite iterates live via HMR; export is client-side WebCodecs. No server. No external service.

## Tech stack

Bun (runtime, package manager, test runner) · Vite · Solid.js · PixiJS (2D) · Three.js (3D) · WebCodecs (export) · TypeScript · Biome · Valibot.

## Monorepo

- `packages/engine/` — headless animation engine. Publishable as `@kut-kut/engine`. See `packages/engine/CLAUDE.md`.
- `apps/studio/` — Solid.js studio (dev-only). See `apps/studio/CLAUDE.md`.
- `projects/<name>/` — each animation is a folder with `scene.ts`, `timeline.json`, `overlay.json`, `assets/`.
- `plans/` — roadmap + session specs + ADRs. **Read `plans/overview.md` first.**

## Non-negotiables

- Engine never depends on app code. Studio imports only from `@kut-kut/engine`'s public entry.
- Engine uses `solid-js` as a **peer dep**. No React, no Vue, no JSX in engine.
- Local dev tool only — one entry: `bun run dev`. No prod deployment.
- **WebCodecs only** for export. No ffmpeg.wasm. No server-side render.
- **No browser file pickers.** All disk IO goes through the Vite project-fs plugin.
- Bun is the runtime and test runner. Scripts assume `bun run`; tests use `bun test`.

## Session workflow

Work happens in ~2h sessions scoped by `plans/sessions/session-NN-*.md`. Use the `/session` skill to draft or continue.

**Session-start context kit** (the agent reads only these three at start):
1. This file (`CLAUDE.md`).
2. `plans/overview.md` — current state, roadmap, compressed progress log.
3. The current session spec.

Past session files are **never** read at session start. If a detail is needed, grep for it on demand.

Session files are a record of what should be done. If implementation deviates, edit the spec. There is no Outcome section — at session end, append a one-line entry to the progress log in `plans/overview.md` and update the Current state paragraph.

## Sub-agents

- **`test-runner`** — runs `bun test` / `bun run typecheck` / `bun run lint` and returns a concise report. The main thread does **not** run these inline; delegate to the sub-agent to keep verbose output out of context.
- **`code-reviewer`** — at session end, before marking done, review the pending git diff against conventions and session scope. Flag, don't fix.

Both live in `.claude/agents/`.

## Mistakes ledger

See `plans/learnings.md`. When a task enters territory where the agent has previously stumbled, check that file first. When a new mistake is discovered and fixed, add a short entry.

## Where things live

- `plans/overview.md` — roadmap, current state, progress log.
- `plans/decisions/` — ADRs (rationale that outlives a session).
- `plans/sessions/` — per-session plan; `_template.md` is the starting point.
- `plans/learnings.md` — mistakes ledger.
- `apps/studio/src/features/<feature>/CLAUDE.md` — feature-level context, added when the feature lands.
- `packages/engine/CLAUDE.md` — engine module map and rules.
- `projects/CLAUDE.md` — `scene.ts` authoring guide (factory contract, naming/path stability, HMR semantics).
