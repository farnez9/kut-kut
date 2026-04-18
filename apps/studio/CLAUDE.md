# @kut-kut/studio

The Solid.js studio. Served by Vite during `bun run dev`. Consumes `@kut-kut/engine` and talks to a custom Vite dev plugin for disk IO. **Dev-only — this is never deployed.**

## Layout

- **src/main.tsx** — boot.
- **src/App.tsx** — layout shell: top bar, left sidebar (scenes/layers), right sidebar (inspector), center preview, bottom timeline, audio drawer.
- **src/features/** — vertical slices. Each feature owns its components, its store, and (once non-trivial) its own `CLAUDE.md`.
  - `preview/` — canvas host; mounts engine renderer; resizes.
  - `playback/` — play/pause/restart controls; hotkeys; time display.
  - `timeline/` — interactive ruler, tracks, clips, keyframes; zoom/pan; drag interactions.
  - `inspector/` — property editors bound to the current selection.
  - `audio/` — import UI, waveform, captions editor, voiceover recording, TTS panel.
  - `project/` — list projects from `projects/`, dynamically import `scene.ts`, keep `timeline.json` in sync via the plugin.
  - `export/` — export dialog, aspect-ratio presets, progress + cancel.
- **src/lib/** — app-level utilities: plugin client, keyboard shortcut registry, settings (TTS provider selection), feature-detect helpers.
- **src/ui/** — low-level Solid primitives (Button, Panel, Tabs, Drawer, Tooltip). Not exported as a package.
- **vite/** — the project-fs Vite dev plugin. Exposes endpoints to read/write `projects/<name>/`. Session 06.

## Rules

- **All rendering/animation/export/audio/TTS logic belongs in `@kut-kut/engine`.** Studio is UI, wiring, and IO. If a piece of logic could run without Solid JSX + DOM chrome, push it into the engine.
- **Solid-idiomatic state.** `createSignal`/`createStore` inside feature stores. No global event bus; no Redux-style dispatchers.
- **Disk IO only via the Vite dev plugin.** No FS Access API, no OPFS, no browser file pickers. The plugin is the single source of truth for persistence.
- **Feature-detect Chromium-only APIs** (WebCodecs, parts of Web Speech). If missing, show a clear banner and a graceful fallback — never a silent no-op.
- **No secrets committed.** `VITE_ELEVENLABS_API_KEY` lives in `.env.local` (gitignored). It will be embedded in the dev bundle — acceptable because the bundle only runs on the user's own machine.

## Feature CLAUDE.md's

Each feature gets its own `CLAUDE.md` once it has non-trivial structure. **Add them as the features land in their respective sessions — don't create them ahead of the code.**
