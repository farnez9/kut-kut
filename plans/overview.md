# Kut-Kut — overview

**Last updated:** 2026-04-19 (session 12 shipped)

## Product

A general-purpose, local-first authoring tool for 2D and 3D animated videos. You define animations as code in this repo, iterate live in a Solid.js studio via Vite HMR, and export an mp4 entirely client-side through WebCodecs. Typical use: explainer, educational, short-form social, marketing — anything where a scripted, programmable pipeline beats a heavy GUI editor. **The engine is content-agnostic; no templates ship.**

### How you use it

1. Create `projects/<name>/scene.ts` (and optionally `timeline.json`, `overlay.json`, `assets/`).
2. Run `bun run dev`.
3. The studio lists projects and loads the one you pick. Preview updates via HMR as you edit `scene.ts`. GUI edits write back to disk through a Vite dev plugin.
4. Click Export → WebCodecs encodes → browser downloads `<name>.mp4`.

## Current state

**Engine.** Scene graph (`Node`/`Group`/`Transform`, 2D and 3D layers, `Rect` and `Box` primitives) with Solid-reactive properties. Project schema validated by valibot, with versioned migrations. Timeline model: `Track`/`Clip`/`Keyframe` per track kind (`number`, `audio`), curated easings, pure `evaluateClip`/`evaluateTrack`, `applyTimeline` resolving dotted node paths. `PlaybackController` with `play`/`pause`/`seek`/`restart`/`dispose` and `onTransition` callback (drift-free, SSR-safe). Renderer interface with Pixi 2D + Three 3D adapters composed via `createCompositor` (stacked canvases, WebGPU → WebGL fallback). Overlay v2 as a property-override + structural-op layer: `applyOverlay` + `applyNodeOps`, migration from v1. Audio: `AudioTrack`/`AudioClip`, `decodeAudio`, `computePeaks`, `createAudioPlayer` driven by `PlaybackController.onTransition`.

**Studio.** CSS-grid shell (topbar / sidebars / preview / bottom timeline) with aquamarine accent. Project slice lists `projects/` and dynamically imports `scene.ts`. Preview host mounts compositor, applies overlay + timeline per frame, rebuilds on structural overlay change via keyed `<Show>`. Interactive timeline: ruler, draggable playhead, clip drag, clip trim, keyframe drag (with reorder), easing glyphs, ctrl+wheel zoom, collapse toggle, 300 ms debounced single-flight persistence. Inspector: keyframe > node > clip selection precedence, transform editors (`NumberInput`, `Vec3Input`). Layers panel with add/delete/restore, unique-name picker. Record mode toggle (`R` hotkey) routes inspector commits to keyframes inside clip windows. Unified command store (cap 200) spans timeline + overlay; `⌘Z` / `⌘⇧Z` work across surfaces.

**Plugin.** `apps/studio/vite/project-fs.ts` — endpoints: list projects, read project (timeline + overlay + asset manifest), write timeline, write overlay, upload asset. Path-safety via name regex + `path.relative` containment.

**Next session:** 13 — studio audio panel (import UI, waveform lane, per-track volume/mute, `AudioPlayer.reconcile`).

## Architecture

See `plans/decisions/0001-architecture-choices.md` for locked decisions. Key split:

- **Engine** is headless (DOM use limited to `HTMLCanvasElement`, `AudioContext`, WebCodecs).
- **Studio** is Solid JSX + user interactions + plugin client. Imports only from `@kut-kut/engine`'s public entry.
- **Vite plugin** (`apps/studio/vite/`) round-trips GUI edits to `projects/<name>/`.

### Monorepo layout

```
/
├── CLAUDE.md
├── package.json                  # Bun workspaces
├── biome.json · tsconfig.base.json · bunfig.toml
├── .env.local                    # gitignored — VITE_ELEVENLABS_API_KEY, etc.
│
├── plans/
│   ├── overview.md               # this file
│   ├── learnings.md              # mistakes ledger
│   ├── sessions/                 # one spec per session + _template.md
│   └── decisions/                # ADRs
│
├── packages/engine/              # @kut-kut/engine — publishable, headless
│   └── src/{scene,reactive,timeline,render,audio,tts,export,project,overlay}/
│
├── apps/studio/                  # Solid.js studio (dev-only)
│   ├── vite/                     # project-fs Vite dev plugin
│   └── src/{App.tsx,features,lib,ui}/
│
└── projects/<name>/              # scene.ts · timeline.json · overlay.json · assets/
```

## Session roadmap

| #   | Session                               | Ships |
|-----|---------------------------------------|-------|
| 13  | Studio: audio panel                   | Import UI (blob → plugin → `assets/`), waveform in timeline, per-track volume/mute, `AudioPlayer.reconcile()` for live `tracks`/`buffers` updates |
| 14  | Voiceover recording                   | MediaRecorder wired to live playback, blob → plugin → `assets/`, added as audio clip |
| 15  | Captions                              | Caption track type, editor bound to timeline/audio track, 2D text overlay, SRT/VTT import/export |
| 16  | TTS: adapters + panel                 | Provider iface, WebSpeech adapter, ElevenLabs adapter, studio panel, output saved via plugin |
| 17  | Engine: export pipeline               | WebCodecs video + audio encode, mp4-muxer, progress/cancel, browser download, export dialog |
| 18  | Short-form vertical mode + aspects    | 16:9 / 9:16 / 1:1 presets, safe-zone guides, per-aspect export configs |
| 19  | Code-first scene authoring polish     | `scene.ts` conventions + helpers, HMR story for scene edits, starter examples |
| 20+ | Polish + publish prep                 | Shortcuts, a11y, perf profiling, docs, engine publish prep |

## Progress log

One line per completed session — the canonical "what exists". Append at session end.

- **01** (2026-04-18) Foundation: Bun workspaces + Vite/Solid scaffolding + Biome; `bun run dev/test/typecheck/lint/format` all green.
- **02** (2026-04-18) Scene graph + project schema: `Node`/`Group`/`Transform`, 2D/3D layers, valibot schema v1, serialize/deserialize with versioned migrations, roundtrip tests. → ADR 0002, 0003
- **03** (2026-04-18) Timeline + playback clock: `Timeline`/`Track`/`Clip`/`Keyframe`, curated easings, pure evaluators, `applyTimeline`, drift-free `PlaybackController` (play/pause/seek/restart/dispose).
- **04** (2026-04-18) Renderer adapters: `Renderer` interface + Pixi 2D + Three 3D + stacked compositor, `Rect` and `Box` leaf primitives, WebGPU-with-WebGL-fallback. → ADR 0004
- **05** (2026-04-18) Studio shell + preview: CSS-grid layout with aquamarine accent, `PreviewHost` driving compositor + `applyTimeline`, `PlaybackControls`, global Space/Home hotkeys.
- **06** (2026-04-19) Project-fs plugin + project loader: Vite dev plugin endpoints, studio project slice, `projects/example/`, track targeting by `nodePath`. → ADR 0005
- **07** (2026-04-19) Interactive timeline: ruler + draggable playhead, clip drag, keyframe markers, ctrl+wheel cursor-anchored zoom, debounced single-flight persistence.
- **08** (2026-04-19) Command store + clip/keyframe edits: undo/redo (cap 200), clip trim, keyframe time drag with reorder, read-only inspector, easing glyphs.
- **09** (2026-04-19) Scene overlay v1 + inspector editing: `overlay.json` property overrides, engine `applyOverlay` pipeline, plugin endpoint + studio slice, transform editors, timeline collapse toggle. → ADR 0006
- **10** (2026-04-19) Scene node create/delete (overlay v2) + Layers panel: `additions`/`deletions`, `applyNodeOps`, panel with tree + add/delete/restore, `<Show keyed>` remount on structural change. → ADR 0007
- **11** (2026-04-19) Record mode + unified undo: record-mode toggle, generalized command store spanning timeline + overlay, inspector→keyframe routing, ⌘Z across surfaces. → ADR 0008
- **12** (2026-04-19) Audio core: `AudioTrack`/`AudioClip`, schema v2 + migration, `decodeAudio`, `computePeaks`, `createAudioPlayer` routed through per-track gain nodes, playback sync via `onTransition`. → ADR 0009

## Performance & memory budgets

- **Live preview:** 60 fps at 1080p on mid-tier Chromium. Scene graph updates flow through Solid signals only — no per-frame reconciliation.
- **Timeline memory:** ~10 min × ~6 tracks × ~20 clips × ~10 keyframes ≈ plain arrays. No virtualization in v1.
- **Audio waveform:** compute peaks once on import; cache in `projects/<name>/assets/.peaks/` keyed by file hash.
- **Export:** 1080p 30 fps × 10 min ≈ 18 000 frames. WebCodecs target: ≤3× realtime.

## Open questions

- **Pixi + Three compositor** stays as stacked canvases for v1. Sharing a `GPUDevice` across both libs is possible but fiddly — revisit with a spike before session 17 (export).
- **Vec3 sub-component keyframes.** `applyTimeline` can't animate `transform.position.x` via `NumberTrack` today. Pick between resolver widening or property splitting when a real project needs it.

## Naming TBDs

- `@kut-kut/engine` is a placeholder scope. Rename at publish time if you use a different npm org.
- Project folders are plain directories — no custom extension.
