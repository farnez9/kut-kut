# Kut-Kut

A local-first authoring tool for 2D and 3D animated videos. Scenes are **code** in this repo; a Solid.js studio served by Vite iterates on them live via HMR; export runs entirely in the browser through WebCodecs.

No server. No external service. No cloud. Your files stay on disk; your video renders locally.

---

## Table of contents

- [What is Kut-Kut?](#what-is-kut-kut)
- [Why code-first?](#why-code-first)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Project anatomy](#project-anatomy)
- [Authoring a scene](#authoring-a-scene)
- [Using the studio](#using-the-studio)
  - [Layout](#layout)
  - [Playback](#playback)
  - [Timeline](#timeline)
  - [Inspector & Record mode](#inspector--record-mode)
  - [Layers panel](#layers-panel)
  - [Undo / redo](#undo--redo)
  - [Keyboard shortcuts](#keyboard-shortcuts)
- [Audio](#audio)
  - [Import](#import)
  - [Voiceover recording](#voiceover-recording)
  - [Text-to-speech](#text-to-speech)
- [Captions](#captions)
- [Aspect presets](#aspect-presets)
- [Exporting](#exporting)
- [Hot module replacement](#hot-module-replacement)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What is Kut-Kut?

Kut-Kut is a **programmable 2D/3D video editor** designed for people who'd rather write a scene than drag rectangles around. You define the scene graph in TypeScript, and the studio gives you a live preview, an interactive timeline, audio tracks, captions, and an export button.

Good fits:

- Explainer videos and educational content.
- Short-form social (YouTube Shorts, Reels, TikTok) with 9:16 / 1:1 aspect presets.
- Marketing shorts where every frame is scripted.
- Anything where a **scripted, version-controllable pipeline** beats a heavy GUI timeline editor.

The engine is content-agnostic. **No templates ship** — you build the scene, Kut-Kut animates and exports it.

---

## Why code-first?

- **Scenes are diffable.** `scene.ts` is real TypeScript — review it in PRs, blame it, branch it.
- **Reuse via functions, not assets.** Build your own helpers for intros, lower-thirds, transitions.
- **The studio does the tedious parts.** Timing, easing curves, keyframe tweaking, audio alignment, captions — all GUI.
- **No lock-in.** The engine is a plain TypeScript package. A `scene.ts` today is still a `scene.ts` in ten years.

The split is: **code owns structure** (what exists), **GUI owns timing** (when it happens).

---

## Requirements

- **[Bun](https://bun.sh) ≥ 1.3** — runtime, package manager, and test runner. One tool.
- **A Chromium-based browser** (Chrome, Edge, Arc, Brave, …).
  - WebCodecs (video + audio encode) is required for export.
  - WebGPU is used when available; WebGL is the automatic fallback.
  - MediaRecorder is required for voiceover recording.
  - Firefox and Safari are not supported for export today. The studio will show a banner when a required API is missing.
- That's it. No Docker, no Node, no npm, no Python, no cloud account.

---

## Installation

```bash
git clone <your-fork-or-this-repo> kut-kut
cd kut-kut
bun install
```

Bun workspaces wires up `@kut-kut/engine` and `@kut-kut/studio` automatically — nothing else to configure.

---

## Quick start

```bash
bun run dev
```

Vite boots on the default port (watch the terminal for the URL, typically `http://localhost:5173`). On first load:

1. The studio scans `projects/` and lists every folder that contains a `scene.ts`.
2. Pick the shipped **`example`** project to see a rotating 2D rectangle and a 3D box.
3. Edit `projects/example/scene.ts` — the preview **hot-swaps** the scene without losing playback time, timeline history, or decoded audio.
4. Tweak timing with the timeline at the bottom. Drag clips, drag keyframes, scrub the playhead.
5. When you're happy, click **Export** in the top bar. The browser downloads `<project>-<timestamp>.mp4`.

To start a new animation, create a folder under `projects/` (name must match `[a-z0-9][a-z0-9._-]*`) with a `scene.ts`. The studio picks it up on next load.

---

## Project anatomy

Every animation lives in its own folder:

```
projects/<name>/
├── scene.ts         # author intent — TypeScript, hand-edited
├── timeline.json    # studio-owned — keyframes/clips/audio/captions
├── overlay.json     # studio-owned — property overrides + structural ops + meta
└── assets/          # audio files, images, anything referenced by the scene
```

- **`scene.ts`** — you write this. It describes the scene graph.
- **`timeline.json`** — the studio writes this as you edit keyframes, clips, audio, captions.
- **`overlay.json`** — the studio writes this for GUI-only tweaks: property overrides on top of the authored scene, additions/deletions of nodes (from the Layers panel), and metadata like aspect preset.
- **`assets/`** — drop audio, images, whatever here. Filenames must match `[A-Za-z0-9._-]+`.

`timeline.json` and `overlay.json` are created on first GUI write — an empty project only needs `scene.ts`.

Only `projects/example/` is tracked in git; your own projects are gitignored by default. Remove the `projects/*/` rule in `.gitignore` if you want to commit them.

---

## Authoring a scene

`scene.ts` must default-export a **factory**: `() => Scene`. Kut-Kut calls it on every project mount so each session gets a fresh signal graph (matters for clean GC on project swap, HMR, and snapshot replay).

Minimal example:

```ts
import {
  createBox,
  createLayer2D,
  createLayer3D,
  createRect,
  createScene,
  type Scene,
} from "@kut-kut/engine";

export default (): Scene => {
  const rect = createRect({
    name: "Hero",
    transform: { scaleX: 180, scaleY: 180 },
    color: [1, 0.42, 0.1],
  });

  const box = createBox({
    name: "Hero",
    transform: {
      position: [0, 0, 700],
      rotation: [0.5, 0.7, 0],
      scale: [320, 320, 320],
    },
    color: [0.22, 0.62, 1],
  });

  return createScene({
    meta: { name: "example", width: 1920, height: 1080, fps: 30, duration: 6 },
    layers: [
      createLayer2D({ name: "2D", children: [rect] }),
      createLayer3D({ name: "3D", children: [box] }),
    ],
  });
};
```

### Authoring helpers

All exposed on `@kut-kut/engine`:

| Helper | Purpose |
| --- | --- |
| `createScene({ meta, layers })` | Top-level scene + metadata (name, width, height, fps, duration). |
| `createLayer2D({ name, children })` | A Pixi-rendered 2D layer. |
| `createLayer3D({ name, children })` | A Three-rendered 3D layer. |
| `createGroup({ name, transform, children })` | Group nodes for shared transforms. |
| `createRect({ name, transform, color })` | 2D rectangle primitive. |
| `createBox({ name, transform, color })` | 3D box primitive. |
| `createTransform2D(...)` / `createTransform3D(...)` | Build a transform without a node factory. |

### Naming & paths — the one thing to watch

`timeline.json` and `overlay.json` reference nodes by **name path**, e.g. `["2D", "Hero"]`. That means:

- **Sibling names must be unique** — the engine throws if you nest two children with the same name.
- **Renaming a node breaks every track and override that targeted it.** There is no rewrite pass today.
- **Layer names matter as much as node names** — the path starts at the layer.

See `projects/CLAUDE.md` for the full authoring contract.

---

## Using the studio

### Layout

A CSS-grid shell with an aquamarine accent:

```
┌────────────────────────────────────────────────────────────┐
│  Top bar  (project · aspect preset · Export)               │
├──────────┬──────────────────────────────┬──────────────────┤
│  Left    │                              │                  │
│ sidebar  │         Preview              │   Inspector      │
│ (layers) │     (Pixi + Three)           │ (property edits) │
│          │                              │                  │
├──────────┴──────────────────────────────┴──────────────────┤
│  Timeline  (ruler · number/audio/caption tracks)           │
└────────────────────────────────────────────────────────────┘
```

### Playback

- **Space** — play / pause
- **Home** — seek to 0
- Drag the playhead in the timeline ruler to scrub.

### Timeline

- **Drag a clip's body** to move it.
- **Drag a clip's edge** to trim (left or right).
- **Drag a keyframe** to change its time (reordering supported).
- **Ctrl + wheel** on the timeline to cursor-anchored zoom.
- **Click a keyframe** to select it; the Inspector becomes a precise editor for that value.
- Timeline persistence is debounced 300 ms and single-flight — edits land in `timeline.json` on disk without thrash.

Three track kinds: **number** (animates scene properties), **audio** (plays a decoded audio buffer), **caption** (renders text in the preview).

### Inspector & Record mode

- The Inspector shows different editors depending on selection precedence: **keyframe > node > clip**.
- Transform editors: `NumberInput`, `Vec3Input`.
- **Press `R`** (or click the record button) to enter **Record mode**: inspector commits inside a clip's time window are routed to that track's keyframes rather than the overlay. Think "automation arm" in a DAW.

### Layers panel

- Tree view of the authored scene plus any overlay additions / deletions.
- Add a node, delete a node (soft delete via overlay), restore deleted nodes.
- Names are picked uniquely (the panel won't let you collide).

### Undo / redo

One unified command store spans timeline and overlay surfaces. History cap: 200.

- **⌘Z** (Mac) / **Ctrl+Z** (Windows/Linux) — undo
- **⌘⇧Z** (Mac) / **Ctrl+Shift+Z** (Windows/Linux) — redo
- **⌘Y** / **Ctrl+Y** — redo (alternative)

Either modifier works on any platform — the handler accepts both `metaKey` and `ctrlKey`.

Works across all studio surfaces: clip moves, keyframe edits, overlay property changes, layer ops, audio clip edits, caption edits, aspect-preset changes.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `Home` | Seek to 0 |
| `R` | Toggle Record mode |
| `C` | Toggle caption overlay visibility (persisted in `localStorage`) |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Shift+Z` | Redo |
| `⌘Y` / `Ctrl+Y` | Redo (alternative) |
| `Ctrl + wheel` (on timeline) | Zoom (cursor-anchored) |
| `Esc` (in caption editor) | Cancel edit |
| `Enter` (in caption editor) | Commit |
| `Shift + Enter` (in caption editor) | Insert newline |

---

## Audio

Audio is a first-class timeline track. Decoded buffers and waveform peaks are cached in memory by `clip.src`; peaks can be persisted under `projects/<name>/assets/.peaks/`.

### Import

- **Import button** in the timeline header: opens a standard upload dialog (routed through the Vite dev plugin, **not** the browser File System Access API). The file is written to `projects/<name>/assets/`, decoded, peaked, and added as an audio track. Undoable.
- Supported extensions: `.mp3`, `.wav`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.aac`, `.flac`, `.webm`.

Once imported, an audio clip supports:

- **Body drag** — move the clip along the timeline.
- **Left-edge trim** — shifts `start` and `offset` by the same delta (non-slip: the underlying sample stays put).
- **Right-edge trim** — clamped to buffer length and a minimum clip duration.
- **Inline mute toggle** and **gain slider** in the track header.

### Voiceover recording

- **Record button** in the timeline header.
- Uses `MediaRecorder` against live playback. The clip's `start` is set to the playback time at record-begin, so the recording lands in sync with what you heard while speaking.
- The resulting file is saved into `assets/` with a timestamped name, then ingested through the same pipeline as Import.

> **Tip (from experience):** browser audio constraints like AGC / noise suppression can pump low-frequency room noise. The recorder keeps them **off**. Record into a decent environment rather than relying on aggressive processing.

### Text-to-speech

- **TTS button** in the timeline header opens the TTS panel: provider, voice, multiline text, **Preview** or **Generate**.
- Shipped provider: **Kokoro** — in-browser via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js). Zero-config: no API key, no server.
  - 27 voices: American English + British English.
  - The first Preview or Generate triggers a one-time `warmUp` that downloads the ONNX model (progress bar shown in the UI, cached by the browser afterwards).
- **Generate** synthesizes WAV → feeds through the shared ingest tail → appears as a new undoable audio track anchored at the current playback time.

The TTS layer is behind a provider interface (`TtsProvider`), so other adapters can slot in without touching the studio.

---

## Captions

- **Caption tracks** are a dedicated timeline row with their own drag / trim / editor UX.
- **Double-click** a caption clip to edit inline (Esc cancels, Enter commits, Shift+Enter adds a newline).
- The timeline header exposes **Add · Import · Export** as both **SRT** and **VTT**.
- Import is tolerant of BOM, CRLF, `,` vs `.` fraction separators, and VTT preamble / NOTE / STYLE / REGION blocks.
- Captions render as a DOM overlay on the preview (bottom-anchored, backdrop-blurred, `aria-live="polite"`).
- Press **`C`** to toggle overlay visibility (persisted in `localStorage`).

---

## Aspect presets

A toggle in the top bar switches between **16:9**, **9:16**, and **1:1**. The choice is stored in `overlay.json` under `meta` and is undoable through the unified command store. Exports pick up whatever the current preset resolves to.

Underneath: `scene.meta` is the author's default; the overlay `meta` shallow-merges on top at both preview and export time. Scene authors don't need to care.

---

## Exporting

Click **Export** in the top bar. An offscreen compositor renders the scene frame-by-frame while the live preview keeps running, so the UI stays responsive.

- **Video:** WebCodecs `VideoEncoder`, H.264 (`avc1.640028`), 8 Mbps, 2 s GOP.
- **Audio:** `OfflineAudioContext` mix → `AudioEncoder`, AAC-LC 128 kbps 48 kHz stereo.
- **Container:** `mp4-muxer` with `ArrayBufferTarget` + `fastStart: "in-memory"`.
- **Progress bar + Cancel** in the dialog.
- **Feature-detect banner** if your browser lacks `VideoEncoder` or `AudioEncoder`.

Output filename: `<project-slug>-<YYYYMMDD-HHmm>.mp4`, downloaded via a standard anchor click (browser download folder).

Back-pressure is handled automatically (`encodeQueueSize` polling); cancellation is polled per frame and per audio chunk via `AbortSignal`.

Target performance: **≤3× realtime** for 1080p 30 fps, subject to your machine.

---

## Hot module replacement

Editing `scene.ts` while `bun run dev` is running hot-swaps the scene factory in place. **What survives an edit:**

- Playback state (current time, play/pause).
- Timeline + overlay stores and undo history.
- Decoded audio buffers and the audio scheduler.
- The Pixi/Three compositor is cleanly disposed and remounted — new geometry appears immediately.

**What does not propagate via HMR** (requires a project re-pick or page reload):

- `meta` changes (`width`, `height`, `fps`, `duration`) — read at provider mount.
- Renaming a node — the new factory's nodes won't match existing overlay/timeline paths until the JSON files are updated.
- The "authored tree" view in the Layers panel — it's the mount-time scene; the preview reflects the new factory but the tree list does not.

---

## Scripts

All run from the repo root via Bun.

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the studio (Vite + Solid + the project-fs plugin). The **only** entry point for authoring. |
| `bun run build` | Build the studio with Vite. Used for artifact inspection — there is no deployed production build. |
| `bun test` | Run engine tests via Bun's test runner. |
| `bun run typecheck` | Run `tsc --noEmit` across all workspaces. |
| `bun run lint` | Biome check across the repo. |
| `bun run format` | Biome format --write across the repo. |

> Kut-Kut is a **local dev tool**. `bun run dev` is the supported entry point. There is no prod deployment, no hosted version, no backend.

---

## Architecture

Two packages, one Vite dev plugin.

- **`@kut-kut/engine`** (`packages/engine/`) — **headless** animation engine. No DOM beyond `HTMLCanvasElement`, `AudioContext`, `MediaRecorder`, WebCodecs. No JSX. Publishable in principle (name is a placeholder — rename before you publish).
- **`@kut-kut/studio`** (`apps/studio/`) — **Solid.js** studio. All UI, wiring, and IO. Imports only from `@kut-kut/engine`'s public entry.
- **`project-fs` Vite plugin** (`apps/studio/vite/project-fs.ts`) — dev-only endpoints to list projects, read project state (timeline + overlay + asset manifest), write `timeline.json` / `overlay.json`, and upload assets. Path safety via regex + `path.relative` containment. **All disk IO goes through this plugin** — no browser file pickers, no FS Access API, no OPFS.
- **`scene-hmr` Vite plugin** (`apps/studio/vite/scene-hmr.ts`) — injects `import.meta.hot.accept(...)` into every `projects/*/scene.ts` and dispatches a `kk:scene-hmr` CustomEvent consumed by the project provider.

Engine submodules: `scene/`, `reactive/`, `timeline/`, `render/` (Pixi 2D + Three 3D + stacked compositor), `audio/`, `captions/`, `tts/`, `export/`, `project/` (schema + migrations), `overlay/`.

Reactivity is **Solid-native**. Solid is a **peer dependency** on the engine — the engine must never depend on anything React/Vue/JSX-y.

Architectural decisions are captured as ADRs in `plans/decisions/`.

---

## Repository layout

```
/
├── README.md                        # you are here
├── CLAUDE.md                        # agent working agreement
├── package.json                     # Bun workspaces
├── biome.json · tsconfig.base.json
│
├── plans/
│   ├── overview.md                  # current state + session roadmap + progress log
│   ├── learnings.md                 # mistakes ledger
│   ├── sessions/                    # one spec per ~2h work session
│   └── decisions/                   # ADRs
│
├── packages/engine/                 # @kut-kut/engine — publishable, headless
│   └── src/{scene,reactive,timeline,render,audio,captions,tts,export,project,overlay}/
│
├── apps/studio/                     # Solid.js studio (dev-only)
│   ├── vite/                        # project-fs + scene-hmr Vite dev plugins
│   └── src/{App.tsx,features,lib,ui}/
│
└── projects/<name>/                 # scene.ts · timeline.json · overlay.json · assets/
```

Studio features (`apps/studio/src/features/`):

`aspect · audio · export · inspector · layers · overlay · playback · preview · project · record · timeline`.

Each non-trivial feature has its own `CLAUDE.md` with local context.