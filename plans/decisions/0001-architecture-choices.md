# 0001 — Architecture choices

**Date:** 2026-04-18  
**Status:** accepted

Captured from project kickoff. These drive the monorepo layout, session roadmap, and every open API surface. If any change, update `plans/overview.md` and any affected session specs.

## Decisions

| # | Area | Choice |
|---|---|---|
| 1 | Product framing | **General-purpose 2D/3D animation/video tool.** No domain emphasis. Explainer/educational/marketing/social are illustrative use cases, not built-in templates. |
| 2 | Rendering/animation stack | **Hybrid custom engine.** Solid-reactive scene graph wrapping PixiJS (2D) + Three.js (3D). Timeline GUI *and* TS scene files are both first-class inputs. |
| 3 | Runtime shape | **Local dev tool.** `bun run dev` serves the Solid studio via Vite. No "prod" deployment. Browser is the runtime for preview and export. |
| 4 | Export | **WebCodecs only.** Video + audio encoded client-side via WebCodecs, muxed with `mp4-muxer`, delivered as a browser download. No ffmpeg.wasm fallback. |
| 5 | Project storage | **Plain folders in the repo:** `projects/<name>/` each containing `scene.ts` (or `.json`), `timeline.json`, and `assets/`. No FS Access API, no OPFS, no browser file pickers. |
| 6 | GUI ↔ disk sync | **Custom Vite dev plugin.** Exposes GET/POST endpoints. Studio sends mutations (keyframe drags, caption edits, asset uploads) to the plugin which writes into the project folder. HMR reflects changes. |
| 7 | Package boundary | **Engine only.** `packages/engine` is the publishable unit (`@kut-kut/engine`). Studio and the Vite plugin are app-specific and not published. |
| 8 | TTS | **Pluggable adapter.** v1 ships Web Speech API + ElevenLabs. ElevenLabs key lives in `.env.local` as `VITE_ELEVENLABS_API_KEY` (gitignored). Future providers drop in behind the same interface. |
| 9 | 2D vs 3D phasing | **Both from the start.** Session 04 integrates Pixi + Three as parallel renderer adapters sharing one compositor. |
| 10 | Max project duration | **~10 min.** Timeline fits in memory; WebCodecs export is chunked but needs no virtualization. |
| 11 | Starter content | **Bring-your-own.** SVG/PNG/GLB/GLTF import. No shipped templates or asset library. |

## Implications

- Engine has `solid-js` as a **peer dep** (for `createSignal`/`createStore` on scene properties).
- Because the studio is dev-only, the Vite dev plugin is the only disk-write mechanism and runs only during `bun run dev`. No production hardening concern for those endpoints.
- **WebCodecs only** → Chromium-first (and recent Safari/Firefox). User accepts this.
- `VITE_*` env vars are embedded in client bundles. Since the bundle is local-dev-only on the user's own machine, key exposure is contained.

## When to revisit

- If this ever becomes a deployed app: replace the Vite dev plugin with a proper backend (Bun HTTP + file IO) and re-home the TTS key.
- If 3D becomes the dominant use case: revisit #9 (Three-only with an orthographic 2D mode could simplify the compositor).
- If projects need to travel between machines: add an export-as-zip (and corresponding import) before publishing the engine.
