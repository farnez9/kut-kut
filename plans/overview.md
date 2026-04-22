# Kut-Kut — overview

**Last updated:** 2026-04-22 (session 17 shipped)

## Product

A general-purpose, local-first authoring tool for 2D and 3D animated videos. You define animations as code in this repo, iterate live in a Solid.js studio via Vite HMR, and export an mp4 entirely client-side through WebCodecs. Typical use: explainer, educational, short-form social, marketing — anything where a scripted, programmable pipeline beats a heavy GUI editor. **The engine is content-agnostic; no templates ship.**

### How you use it

1. Create `projects/<name>/scene.ts` (and optionally `timeline.json`, `overlay.json`, `assets/`).
2. Run `bun run dev`.
3. The studio lists projects and loads the one you pick. Preview updates via HMR as you edit `scene.ts`. GUI edits write back to disk through a Vite dev plugin.
4. Click Export → WebCodecs encodes → browser downloads `<name>.mp4`.

## Current state

**Engine.** Scene graph (`Node`/`Group`/`Transform`, 2D and 3D layers, `Rect` and `Box` primitives) with Solid-reactive properties. Project schema validated by valibot at v3, chained migrations from v1. Timeline model: `Track`/`Clip`/`Keyframe` per track kind (`number`, `audio`, `caption`), curated easings, pure `evaluateClip`/`evaluateTrack`/`evaluateCaptionTrack` (half-open `[start, end)`, later-start wins on overlap), `applyTimeline` resolving dotted node paths. `PlaybackController` with `play`/`pause`/`seek`/`restart`/`dispose` and `onTransition` callback (drift-free, SSR-safe). Renderer interface with Pixi 2D + Three 3D adapters composed via `createCompositor` (stacked canvases, WebGPU → WebGL fallback). Overlay v2 as a property-override + structural-op layer: `applyOverlay` + `applyNodeOps`, migration from v1. Audio: `AudioTrack`/`AudioClip`, `decodeAudio`, `computePeaks`, `createAudioPlayer` driven by `PlaybackController.onTransition`. Captions: pure SRT/VTT `parse`/`serialize` tolerating BOM, CRLF, `,`/`.` fractions and VTT preamble/NOTE/STYLE/REGION blocks. TTS: provider-agnostic `TtsProvider` interface (`voices`/`preview`/`synthesize`/`warmUp`) with `createKokoroProvider` (in-browser via `kokoro-js`, lazy ONNX download cached by the browser, 27-voice American + British English roster, returns WAV via `floatPcmToWav`). Audio scheduler (`createAudioPlayer`) is idempotent — active sources keyed by `clip.id`, force-restart only on seek / state transition, gain changes land on the existing `GainNode`.

**Studio.** CSS-grid shell (topbar / sidebars / preview / bottom timeline) with aquamarine accent. Project slice lists `projects/` and dynamically imports `scene.ts`. Preview host mounts compositor, applies overlay + timeline per frame, rebuilds on structural overlay change via keyed `<Show>`. Interactive timeline: ruler, draggable playhead, clip drag, clip trim, keyframe drag (with reorder), easing glyphs, ctrl+wheel zoom, collapse toggle, 300 ms debounced single-flight persistence. Inspector: keyframe > node > clip selection precedence, transform editors (`NumberInput`, `Vec3Input`). Layers panel with add/delete/restore, unique-name picker. Record mode toggle (`R` hotkey) routes inspector commits to keyframes inside clip windows. Unified command store (cap 200) spans timeline + overlay; `⌘Z` / `⌘⇧Z` work across surfaces. Audio: `<AudioProvider>` owns decoded buffers + peaks keyed by `clip.src` (lazy `AudioContext`, decode-on-tracks-change), `<AudioPlayerHost>` mounts the engine player and calls `reconcile()` on buffer/track edits, timeline renders an audio row with inline mute + gain and a canvas waveform per clip. File import, microphone recording, and TTS generation all funnel through a shared `ingestAudioFile(file, startAt)` tail (public on the `AudioContextValue`: upload via plugin → decode → peaks → undoable `addAudioTrackCommand`); `<RecordButton>` drives MediaRecorder against live playback, clip `start` = playback time at record-begin. Audio clips are draggable and trimmable (body + left-handle + right-handle) with non-slip semantics on left-trim (shift `start` + `offset` by same delta); drags push `moveAudioClipCommand` / `resizeAudioClipLeftCommand` / `resizeAudioClipRightCommand` on `pointerup`, all undoable via the unified store. Caption tracks render as a dedicated row with drag + trim + double-click-to-edit (inline `<textarea>`, Esc cancels, Enter commits, Shift+Enter inserts newline); timeline header adds Add/Import/Export SRT·VTT; a DOM `<CaptionOverlay>` mounts in the preview (bottom-anchored, backdrop-blurred, `aria-live="polite"`) with a global `C` hotkey toggling visibility (localStorage-persisted via a `createRoot` signal). TTS: `<TtsButton>` in the timeline header toggles `<TtsPanel>` (provider + voice selects, multiline textarea, Preview/Generate); the only shipped provider is Kokoro (in-browser, zero-config) — first Preview/Generate triggers a one-time `warmUp` that streams ONNX download progress into a UI strip; subsequent calls synthesize from the browser cache. Generate synthesizes → wraps as `File` with `makeTtsFilename(now, providerId, ext)` → calls the shared ingest tail so the new track lands at `playback.time()` as a standard undoable add.

**Plugin.** `apps/studio/vite/project-fs.ts` — endpoints: list projects, read project (timeline + overlay + asset manifest), write timeline, write overlay, upload asset. Path-safety via name regex + `path.relative` containment.

**Next session:** 18 — Engine export pipeline (WebCodecs video + audio encode, mp4-muxer, progress/cancel, browser download, export dialog).

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
├── .env.local                    # gitignored — VITE_* secrets for future adapters
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
| 15  | Audio clip editing                    | Drag + trim-left/right on audio clips, offset-aware waveform, three new undoable commands |
| 16  | Captions                              | Caption track type, editor bound to timeline/audio track, 2D text overlay, SRT/VTT import/export |
| 17  | TTS: adapters + panel                 | Provider iface, Kokoro (in-browser) adapter, studio panel with warm-up progress, idempotent audio scheduler |
| 18  | Engine: export pipeline               | WebCodecs video + audio encode, mp4-muxer, progress/cancel, browser download, export dialog |
| 19  | Short-form vertical mode + aspects    | 16:9 / 9:16 / 1:1 presets, safe-zone guides, per-aspect export configs |
| 20  | Code-first scene authoring polish     | `scene.ts` conventions + helpers, HMR story for scene edits, starter examples |
| 21+ | Polish + publish prep                 | Shortcuts, a11y, perf profiling, docs, engine publish prep |

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
- **13** (2026-04-20) Studio audio panel: `<AudioProvider>` (lazy `AudioContext`, buffers/peaks by `clip.src`, decode-on-tracks-change), `<AudioPlayerHost>` (lazy player + `reconcile()` seam), audio timeline row with inline mute/gain + canvas waveform, import button (plugin upload → decode → undoable add-track). → ADR 0010
- **14** (2026-04-21) Voiceover recording: `MediaRecorder` wired to live playback (clip `start` = playback time at record-begin), shared `ingestAudioFile` tail with import, `<RecordButton>` with elapsed timer + feature-detect fallback, pure helpers (`pickRecordingMime`, `extensionForMime`, `makeRecordingFilename`).
- **15** (2026-04-21) Audio clip editing: body drag + left/right trim on audio clips with non-slip semantics (left-trim shifts `start` + `offset` by the same delta), three raw setters on `TimelineContext` + matching undoable commands, buffer-length + `MIN_CLIP_SEC` clamps at the call site, waveform already offset-aware from session 13.
- **16** (2026-04-21) Captions: engine `CaptionTrack`/`CaptionClip` + schema v3 migration, pure SRT/VTT parse+serialize (tolerates BOM/CRLF/`,`·`.`/VTT preamble), timeline caption row with drag/trim/inline textarea editor and Add·Import·Export SRT·VTT header buttons, DOM `<CaptionOverlay>` in the preview with global `C` hotkey.
- **17** (2026-04-22) TTS: engine `TtsProvider` iface + `createKokoroProvider` (in-browser via `kokoro-js`, lazy ONNX model load with `warmUp(onProgress)`, `floatPcmToWav` helper); studio `<TtsButton>`/`<TtsPanel>` with cold→loading→ready warm-up state, Generate routes through the now-public shared `ingestAudioFile` tail; shared `extensionForMime` hoisted to `features/audio/mime.ts`. Hardened `createAudioPlayer.reconcile()` to be idempotent (active sources keyed by `clip.id`; force-restart only on seek / state transition; gain-only updates stay on the `GainNode`) — fixes metallic/bassy artefact on timeline playback of generated and recorded clips.

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
