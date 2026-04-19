# Kut-Kut — overview

**Last updated:** 2026-04-19 (session 08 shipped; table renumbered)

> **Session 08 scope split.** The original row 08 bundled (a) inspector editing, (b) node create/delete, (c) keyframe-record mode, and (d) undo/redo. Items (a)/(b)/(c) all depend on a scene overlay state file that ADR 0003 defers to a new ADR — too large to share the 2h budget. Session 08 shipped the undo/redo foundation plus clip trim and keyframe drag. The remainder moves to a new session 09 ("scene overlay + inspector editing + create/delete + record mode"), and every row numbered 09+ has been shifted down by one.

## Product

A general-purpose, local-first authoring tool for 2D and 3D animated videos. You define animations as code in your repo, iterate live in a Solid.js studio via Vite HMR, and export a finished mp4 entirely client-side through WebCodecs. Typical use cases include explainer/educational content, marketing animations, short-form social video, and anything where a scripted, programmable animation pipeline beats a heavy GUI-only editor. **The engine is content-agnostic — it ships no templates.**

### How you use it

1. Create `projects/my-first/scene.ts` (and optionally `timeline.json`, `assets/`) in this repo.
2. Run `bun run dev`.
3. The studio boots, lists projects, loads the one you pick. Preview updates via HMR as you edit `scene.ts`.
4. Drag keyframes on the timeline, import audio, record a voiceover, generate TTS, edit captions — the GUI POSTs mutations to a Vite dev plugin that writes them into `projects/my-first/`.
5. Click Export → WebCodecs encodes video + audio → browser downloads `my-first.mp4`.

## Architecture

See `plans/decisions/0001-architecture-choices.md` for locked decisions and their rationale. In short:

- **Local dev tool**, not a deployed app. The only entry is `bun run dev`.
- **Hybrid custom engine**: Solid-reactive scene graph over PixiJS + Three.js.
- **Projects live at `projects/<name>/`.** A Vite dev plugin round-trips GUI edits to disk.
- **WebCodecs only** for export (no ffmpeg.wasm).
- **Engine is publishable** (`@kut-kut/engine`); studio and plugin are not.

### Monorepo layout

```
/
├── CLAUDE.md
├── package.json                  # Bun workspaces
├── bunfig.toml
├── biome.json
├── tsconfig.base.json
├── .env.local                    # gitignored — VITE_ELEVENLABS_API_KEY, etc.
│
├── plans/
│   ├── overview.md               # (this file)
│   ├── CLAUDE.md
│   ├── sessions/                 # one spec per session + _template.md
│   └── decisions/                # ADR-style notes
│
├── packages/
│   └── engine/                   # @kut-kut/engine — publishable, headless
│       ├── CLAUDE.md
│       └── src/
│           ├── scene/            # Node, Group, Transform, 2D/3D layers, properties
│           ├── reactive/         # Solid signal bindings for scene properties
│           ├── timeline/         # Timeline, Track, Clip, Keyframe, easing, playback clock
│           ├── render/           # Renderer iface + Pixi adapter + Three adapter + compositor
│           ├── audio/            # Web Audio graph, waveform, sync
│           ├── tts/              # Provider iface + WebSpeech + ElevenLabs
│           ├── export/           # WebCodecs encoder + mp4-muxer + download trigger
│           └── project/          # Project schema, serialize/deserialize, migrations
│
├── apps/
│   └── studio/                   # Solid.js studio (dev-only)
│       ├── CLAUDE.md
│       ├── vite/                 # the project-fs Vite dev plugin lives here
│       └── src/
│           ├── App.tsx
│           ├── features/
│           │   ├── preview/      # canvas host
│           │   ├── playback/     # play/pause/restart, hotkeys
│           │   ├── timeline/     # interactive ruler, tracks, keyframes
│           │   ├── inspector/    # property panel
│           │   ├── audio/        # import, captions, voiceover, TTS
│           │   ├── project/      # list + load from projects/, talks to Vite plugin
│           │   └── export/       # export dialog + progress
│           ├── lib/              # app-level utils: plugin client, shortcuts, feature-detect
│           └── ui/               # low-level Solid primitives
│
└── projects/
    └── <name>/
        ├── scene.ts              # or scene.json — the user's scene definition
        ├── timeline.json         # tracks/clips/keyframes (written by the studio)
        └── assets/               # imported/recorded/generated audio, images, etc.
```

### Engine ⇄ Studio ⇄ Plugin split

- **Engine** is headless: scene graph, timeline math, renderers, audio graph, TTS providers, export. DOM usage limited to `HTMLCanvasElement`, `AudioContext`, `MediaRecorder`, and WebCodecs APIs.
- **Studio** is Solid JSX + user interactions + plugin client. Imports only from `@kut-kut/engine`'s public entry.
- **Vite dev plugin** lives in `apps/studio/vite/` (it's a studio concern, not an engine one). Expected surface (finalized in session 06):
  - `GET /__kk/projects` — list project folders
  - `GET /__kk/projects/:name` — read timeline.json + asset manifest
  - `POST /__kk/projects/:name/timeline` — write timeline.json
  - `POST /__kk/projects/:name/assets` — upload a blob into `assets/`

## Session roadmap

Each row is one ~2h working session. Drafted into `plans/sessions/session-NN-*.md` before it runs. Update this table when scope shifts.

| #   | Session                                         | Ships |
|-----|-------------------------------------------------|-------|
| 01  | Foundation & scaffolding                        | Bun workspaces, Vite+Solid, stub engine, Biome; `bun run dev / test / typecheck / lint / format` all green |
| 02  | Engine: scene graph + project schema            | Node/Group/Transform, 2D/3D layer types, project schema v1 with validation + serialization roundtrip tests |
| 03  | Engine: timeline + playback clock               | Timeline/Track/Clip/Keyframe, easing curves, interpolation evaluator, `PlaybackController` (play/pause/seek/restart), clock tests |
| 04  | Engine: renderer adapters (Pixi + Three)        | `Renderer` interface, Pixi 2D adapter, Three 3D adapter, layered compositor mounting on one canvas host |
| 05  | Studio: app shell + preview                     | Layout (top bar / sidebars / center preview / bottom timeline), preview mounts engine with an in-memory demo scene, playback controls + hotkeys (space / home) |
| 06  | Studio: Vite project-fs plugin + project loader | Plugin endpoints (list / read / write timeline / upload asset), studio-side client, boot flow that lists `projects/` and dynamically imports `scene.ts` |
| 07  | Studio: interactive timeline                    | Ruler with draggable playhead, track rows, draggable clips, keyframe markers, zoom/pan; edits persist via plugin |
| 08  | Studio: command store + clip/keyframe edits     | Command store with undo/redo, clip trim handles, keyframe time drag, read-only inspector panel bound to selection |
| 09  | Studio: scene overlay + inspector editing       | Overlay state file (new ADR), inspector property editors bound to selection, create/delete nodes, keyframe-record mode |
| 10  | Engine: audio core                              | AudioTrack/AudioClip, decode on import, waveform peaks (offline), playback synced to timeline clock |
| 11  | Studio: audio panel                             | Import UI (blob → plugin → `assets/`), waveform in timeline, per-track volume/mute |
| 12  | Voiceover recording                             | MediaRecorder wired to live playback, blob → plugin → `assets/`, added as audio clip |
| 13  | Captions                                        | Caption track type, editor bound to timeline or audio track, 2D text overlay in preview, SRT/VTT import/export |
| 14  | TTS: adapters + panel                           | Provider iface, WebSpeech adapter, ElevenLabs adapter (key from `VITE_ELEVENLABS_API_KEY`), studio panel, output saved via plugin as an audio clip |
| 15  | Engine: export pipeline                         | WebCodecs video + audio encode, mp4-muxer, progress/cancel, browser download; export dialog in studio |
| 16  | Short-form vertical mode + aspect presets       | 16:9 / 9:16 / 1:1 presets, safe-zone guides, per-aspect export configs |
| 17  | Code-first scene authoring polish               | `scene.ts` conventions and helpers, HMR story for scene edits, starter examples (empty 2D, empty 3D) |
| 18+ | Polish: shortcuts, a11y, perf profiling, docs, engine publish prep | Final cleanup before publishing `@kut-kut/engine` |

## Performance & memory budgets

- **Live preview:** target 60 fps at 1080p on mid-tier Chromium. Scene graph updates flow through Solid signals only — no per-frame reconciliation.
- **Timeline memory:** ~10 min × ~6 tracks × ~20 clips × ~10 keyframes ≈ comfortably in plain arrays. No virtualization in v1.
- **Audio waveform:** compute peaks once on import; cache in `projects/<name>/assets/.peaks/` keyed by file hash.
- **Export:** 1080p 30 fps × 10 min ≈ 18 000 frames. WebCodecs target: ≤3× realtime on Chromium.

## Open questions

- **Pixi + Three compositor:** WebGPU primary (PixiJS v8 native, Three.js `WebGPURenderer`) with WebGL fallback via Pixi's auto-fallback. Realistic v1 is two stacked canvases (one Pixi, one Three), each on WebGPU — sharing a `GPUDevice` across both libs is possible but fiddly; revisit in session 04 with a small spike.
- **Undo/redo granularity:** resolved in session 08 — per-command, one drag = one command, store owned by `<TimelineProvider>`.
- **Scene source format:** resolved in `plans/decisions/0003-scene-source-format.md` — TS is primary for authoring, JSON for runtime state. Session 17 still finalizes the `scene.ts` helper conventions.
- **Plugin endpoint shape:** exact verbs and payload schema. Finalized in session 06.

## Naming TBDs

- `@kut-kut/engine` is a placeholder scope. Rename at publish time if you use a different npm org.
- Project folders are plain directories — no custom extension.
