# Kut-Kut

A general-purpose, local-first authoring tool for 2D and 3D animated videos. Author scenes as code in your repo, iterate live in a Solid.js studio via Vite HMR, and export an mp4 entirely client-side through WebCodecs. No server, no external service.

## Monorepo

- `packages/engine/` — headless animation engine (scene graph, timeline, renderers, audio, TTS, export). Publishable as `@kut-kut/engine`. See `packages/engine/CLAUDE.md`.
- `apps/studio/` — the Solid.js studio served by Vite. See `apps/studio/CLAUDE.md`.
- `projects/<name>/` — your animations. Each is a folder with `scene.ts`, `timeline.json`, and `assets/`. The studio lists them and loads the one you pick.
- `plans/` — roadmap and per-session specs. **Read `plans/overview.md` first.** See `plans/CLAUDE.md`.

## Non-negotiables

- Engine must not depend on app code. Studio imports only from `@kut-kut/engine`'s public entry.
- Engine uses `solid-js` reactivity (signals/stores) as a **peer dep**. No React, no Vue, no framework-specific UI in the engine.
- This is a local dev tool. The only way to run it is `bun run dev`. There is no prod deployment.
- **WebCodecs only** for export. No ffmpeg.wasm. No server-side render.
- **No browser file pickers.** Projects live under `projects/<name>/`. GUI edits (timeline drags, audio imports, captions, voiceover, TTS output) write back to disk through a custom Vite dev plugin.
- Bun is the runtime, package manager, and test runner. Scripts assume `bun run`, tests use `bun test`.

## Working rhythm

- **Never one-shot a feature.** Each working session is ~2h, scoped by a spec in `plans/sessions/session-NN-*.md`.
- Before coding, re-read the session spec. If scope looks off, update the spec *first*.
- At session end, fill the spec's Outcome section; update `plans/overview.md` if the roadmap shifted.

## Where things live

- Architectural decisions and rationale: `plans/decisions/`.
- Session specs (one per session): `plans/sessions/`.
- Feature-level context: `apps/studio/src/features/<feature>/CLAUDE.md` — add each one *when* the feature lands, not ahead of it.
