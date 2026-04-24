# Kut-Kut — overview

**Last updated:** 2026-04-25 (session 22 shipped)

## Product

A general-purpose, local-first authoring tool for 2D and 3D animated videos. You define animations as code in this repo, iterate live in a Solid.js studio via Vite HMR, and export an mp4 entirely client-side through WebCodecs. Typical use: explainer, educational, short-form social, marketing — anything where a scripted, programmable pipeline beats a heavy GUI editor. **The engine is content-agnostic; no templates ship.**

### How you use it

1. Create `projects/<name>/scene.ts` (and optionally `timeline.json`, `overlay.json`, `assets/`).
2. Run `bun run dev`.
3. The studio lists projects and loads the one you pick. Preview updates via HMR as you edit `scene.ts`. GUI edits write back to disk through a Vite dev plugin.
4. Click Export → WebCodecs encodes → browser downloads `<name>.mp4`.

## Current state

**Engine.** Scene graph (`Node`/`Group`/`Transform`, 2D and 3D layers, `Rect`/`Box`/`Text`/`Circle`/`Line`/`Image` primitives) with Solid-reactive properties. Project schema validated by valibot at v4, chained migrations from v1. Timeline model: `Track`/`Clip`/`Keyframe` per track kind (`number`, `audio`, `caption`), curated easings, pure `evaluateClip`/`evaluateTrack`/`evaluateCaptionTrack` (half-open `[start, end)`, later-start wins on overlap), `applyTimeline` resolving dotted node paths. `PlaybackController` with `play`/`pause`/`seek`/`restart`/`dispose` and `onTransition` callback (drift-free, SSR-safe). Renderer interface with Pixi 2D + Three 3D adapters composed via `createCompositor` (stacked canvases, WebGPU → WebGL fallback). Overlay v2 as a property-override + structural-op layer: `applyOverlay` + `applyNodeOps`, migration from v1. Audio: `AudioTrack`/`AudioClip`, `decodeAudio`, `computePeaks`, `createAudioPlayer` driven by `PlaybackController.onTransition`. Captions: pure SRT/VTT `parse`/`serialize` tolerating BOM, CRLF, `,`/`.` fractions and VTT preamble/NOTE/STYLE/REGION blocks. TTS: provider-agnostic `TtsProvider` interface (`voices`/`preview`/`synthesize`/`warmUp`) with `createKokoroProvider` (in-browser via `kokoro-js`, lazy ONNX download cached by the browser, 27-voice American + British English roster, returns WAV via `floatPcmToWav`). Audio scheduler (`createAudioPlayer`) is idempotent — active sources keyed by `clip.id`, force-restart only on seek / state transition, gain changes land on the existing `GainNode`.

**Studio.** CSS-grid shell (topbar / sidebars / preview / bottom timeline) with aquamarine accent. Project slice lists `projects/` and dynamically imports `scene.ts`. Preview host mounts compositor, applies overlay + timeline per frame, rebuilds on structural overlay change via keyed `<Show>`. Interactive timeline: ruler, draggable playhead, clip drag, clip trim, keyframe drag (with reorder), easing glyphs, ctrl+wheel zoom, collapse toggle, 300 ms debounced single-flight persistence. Inspector: keyframe > node > clip selection precedence, transform editors (`NumberInput`, `Vec3Input`). Layers panel with add/delete/restore, unique-name picker. Record mode toggle (`R` hotkey) routes inspector commits to keyframes inside clip windows. Unified command store (cap 200) spans timeline + overlay; `⌘Z` / `⌘⇧Z` work across surfaces. Audio: `<AudioProvider>` owns decoded buffers + peaks keyed by `clip.src` (lazy `AudioContext`, decode-on-tracks-change), `<AudioPlayerHost>` mounts the engine player and calls `reconcile()` on buffer/track edits, timeline renders an audio row with inline mute + gain and a canvas waveform per clip. File import, microphone recording, and TTS generation all funnel through a shared `ingestAudioFile(file, startAt)` tail (public on the `AudioContextValue`: upload via plugin → decode → peaks → undoable `addAudioTrackCommand`); `<RecordButton>` drives MediaRecorder against live playback, clip `start` = playback time at record-begin. Audio clips are draggable and trimmable (body + left-handle + right-handle) with non-slip semantics on left-trim (shift `start` + `offset` by same delta); drags push `moveAudioClipCommand` / `resizeAudioClipLeftCommand` / `resizeAudioClipRightCommand` on `pointerup`, all undoable via the unified store. Caption tracks render as a dedicated row with drag + trim + double-click-to-edit (inline `<textarea>`, Esc cancels, Enter commits, Shift+Enter inserts newline); timeline header adds Add/Import/Export SRT·VTT; a DOM `<CaptionOverlay>` mounts in the preview (bottom-anchored, backdrop-blurred, `aria-live="polite"`) with a global `C` hotkey toggling visibility (localStorage-persisted via a `createRoot` signal). TTS: `<TtsButton>` in the timeline header toggles `<TtsPanel>` (provider + voice selects, multiline textarea, Preview/Generate); the only shipped provider is Kokoro (in-browser, zero-config) — first Preview/Generate triggers a one-time `warmUp` that streams ONNX download progress into a UI strip; subsequent calls synthesize from the browser cache. Generate synthesizes → wraps as `File` with `makeTtsFilename(now, providerId, ext)` → calls the shared ingest tail so the new track lands at `playback.time()` as a standard undoable add.

**Plugin.** `apps/studio/vite/project-fs.ts` — endpoints: list projects, read project (timeline + overlay + asset manifest), write timeline, write overlay, upload asset. Path-safety via name regex + `path.relative` containment.

**Export.** Engine `export/` orchestrates a frame-stepped render: `LayerRenderer.renderFrame()` forces sync draws on Pixi + Three, `Compositor.composite(output)` z-orders layer canvases onto one output canvas per frame, `exportVideo({scene, timeline, overlay, audioTracks, audioBuffers, compositor, signal, onProgress})` feeds `VideoFrame`s to `VideoEncoder` (H.264 `avc1.640028`, 8 Mbps, 2s GOP) in parallel with `mixTimelineAudio` (OfflineAudioContext → planar f32 → AudioEncoder, AAC-LC 128 kbps 48 kHz stereo), muxed via `mp4-muxer` with `ArrayBufferTarget` + `fastStart: "in-memory"`, returns a `Blob`. Back-pressure via `encodeQueueSize` polling (maxQueue 4 video / 8 audio); cancellation polled per frame + audio chunk via `AbortSignal`. Studio `features/export/`: `<ExportButton>` in topbar, `<ExportDialog>` mounts its own offscreen compositor (so live preview keeps running), shows scene meta + progress bar + Cancel, feature-detects `VideoEncoder`/`AudioEncoder` with a banner, downloads via anchor click as `<project-slug>-<YYYYMMDD-HHmm>.mp4`.
	
**Aspect presets.** Overlay schema v3 adds an optional `meta?` field; `applyOverlayMeta` shallow-merges it onto `scene.meta` inside `OverlayProvider.scene()` and at the top of `exportVideo`. Studio `<AspectPresetToggle>` in the topbar commits `setOverlayMetaCommand` (routed through the unified command store, undoable + persisted in `overlay.json`) for 16:9 / 9:16 / 1:1. `PreviewStageHost` letterbox-scaffolds the preview with live `aspect-ratio` (best-effort — the host doesn't fully narrow in portrait inside the flex cell; deferred).

**Scene HMR.** `apps/studio/vite/scene-hmr.ts` injects `import.meta.hot.accept(...)` into every `projects/*/scene.ts`, dispatching a `kk:scene-hmr` CustomEvent with the new module + `import.meta.url`. `<ProjectProvider>` exposes a `liveFactory` signal; the bundle's `factory` field is a stable wrapper that delegates to `liveFactory()`. `OverlayProvider.scene()`'s memo (which calls `props.factory()`) tracks `liveFactory` transitively, so a swap re-runs the memo, `<KeyedPreviewHost>` disposes + remounts the compositor cleanly, and the bundle reference itself doesn't change — `<Show keyed>` keeps `PlaybackProvider`/`OverlayProvider`/`TimelineProvider`/`AudioProvider` mounted, so playback time, undo history, and decoded audio buffers all survive. Authoring conventions live in `projects/CLAUDE.md` (factory contract, name-path stability, HMR semantics).

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
| 19  | Short-form vertical mode + aspects    | 16:9 / 9:16 / 1:1 presets via overlay meta, export picks up scene dimensions |
| 20  | Code-first scene authoring polish     | `scene.ts` HMR (factory hot-swap preserves playback/audio/undo) + `projects/CLAUDE.md` authoring guide |
| 21  | Primitives: text + circle + line      | New scene nodes (2D + 3D), Pixi/Three mounts, schema v4, overlay `NodeKind` extension, Layers add menu + Inspector editors |
| 22  | Primitives: image                     | `Image` scene node (2D + 3D), shared asset-upload flow, export awaits texture loads, anatomy-demo smoke |
| 23  | Primitives: arrow + polygon           | Arrow caps added to `Line` (no new type), new `Polygon` primitive (2D + 3D) with fill + stroke |
| 24  | Stroke reveal *(tentative)*           | `progress: 0..1` prop on Line/Polygon/Circle for draw-in animation via existing NumberTrack |

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
- **18** (2026-04-22) Export pipeline: engine `export/` with `mixTimelineAudio` (OfflineAudioContext), `encodeVideoStream`/`encodeAudioStream` back-pressured WebCodecs helpers, `exportVideo` top-level orchestrator muxing via `mp4-muxer` to a `Blob`; `LayerRenderer.renderFrame()` + `Compositor.composite(output)` added for frame-stepped compositing; studio `<ExportButton>` + `<ExportDialog>` (offscreen compositor, progress + cancel, feature-detect banner, timestamped filename).
- **19** (2026-04-23) Aspect presets: overlay schema v3 with optional `meta?` (width/height/fps/duration), pure `applyOverlayMeta` called from `OverlayProvider.scene()` + top of `exportVideo`, studio `<AspectPresetToggle>` in topbar with `setOverlayMetaCommand` (undoable, persisted). Preview letterbox scaffolded via inline `aspect-ratio` on `PreviewStageHost` — visual fit imperfect in portrait/square (deferred). Safe-zone overlay implemented then removed pre-commit.
- **20** (2026-04-23) Scene HMR: `apps/studio/vite/scene-hmr.ts` injects `import.meta.hot.accept(...)` into every `projects/*/scene.ts` and dispatches a `kk:scene-hmr` CustomEvent; `<ProjectProvider>` exposes a `liveFactory` signal with a stable `bundle.factory` wrapper that delegates to it, so OverlayProvider's `scene` memo re-runs on edit, KeyedPreviewHost remounts the compositor, and bundle identity stays stable (Playback/Timeline/Audio/undo all survive). Authoring conventions documented in new `projects/CLAUDE.md`. Plugin regex covered by `scene-hmr.test.ts`.
- **21** (2026-04-24) Primitives text+circle+line: engine `scene/{text,circle,line}.ts` with reactive props, Pixi 2D mounts (`Text`, `Graphics.circle`, polyline `stroke`), Three 3D mounts (`troika-three-text` SDF, `CircleGeometry`, core `Line` + `LineBasicMaterial`); project schema v4 with no-op `migrateV3ToV4`; overlay `NodeKind` widened to `rect|box|group|text|circle|line` and `OverrideValueSchema` accepts `number|string|Vec3|Vec3[]`; Layers panel "Add" menu + Inspector editors (`TextInput`, two-endpoint line editor storing whole `points` in one override); `projects/chem-demo` authored; new `troika-three-text` runtime dep on the engine.
- **22** (2026-04-25) Primitives image: engine `scene/image.ts` (reactive `src`/`width`/`height`), Pixi 2D mount (`Sprite` + `Assets.load`, anchor 0.5, re-applies authored size on texture-swap), Three 3D mount (wrapper `Group` + `PlaneGeometry(1,1)` + `MeshBasicMaterial({transparent:true})` + async `TextureLoader`); project schema v5 with no-op `migrateV4ToV5`; overlay `NodeKind` widened with `image` plus optional `src`/`width`/`height` on `NodeAddition` so Layers-panel adds carry initial props; `LayerRenderer.ready()` + `Compositor.ready()` seam awaiting outstanding texture loads, `exportVideo` warm-applies overlay+timeline at t=0 and awaits `compositor.ready()` before frame 0; studio Layers "Add Image" runs `pickFile` → `decodeImageDimensions` → `uploadAsset` → undoable `addNode`; Inspector `ImageNodeEditor` reuses `NumberInput` for width/height with a read-only `src` row + "Replace…" button; shared `apps/studio/src/lib/pick-file.ts`. `projects/anatomy-demo` shell authored — bicep PNGs are user-supplied.

## Performance & memory budgets

- **Live preview:** 60 fps at 1080p on mid-tier Chromium. Scene graph updates flow through Solid signals only — no per-frame reconciliation.
- **Timeline memory:** ~10 min × ~6 tracks × ~20 clips × ~10 keyframes ≈ plain arrays. No virtualization in v1.
- **Audio waveform:** compute peaks once on import; cache in `projects/<name>/assets/.peaks/` keyed by file hash.
- **Export:** 1080p 30 fps × 10 min ≈ 18 000 frames. WebCodecs target: ≤3× realtime.

## Open questions

- **Pixi + Three compositor** stays as stacked canvases. Shared `GPUDevice` was not needed for export (session 18) — revisit only if export perf becomes a bottleneck.
- **Vec3 sub-component keyframes.** `applyTimeline` can't animate `transform.position.x` via `NumberTrack` today. Pick between resolver widening or property splitting when a real project needs it.

## Naming TBDs

- `@kut-kut/engine` is a placeholder scope. Rename at publish time if you use a different npm org.
- Project folders are plain directories — no custom extension.
