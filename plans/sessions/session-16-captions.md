# Session 16 — captions

**Estimated:** ~2h focused
**Depends on:** 12 (audio core), 13 (studio audio panel), 15 (audio clip editing)
**Status:** done
**Links:** `packages/engine/src/timeline/types.ts`, `packages/engine/src/project/schema.ts`, `apps/studio/src/features/timeline/`, `apps/studio/src/features/audio/CLAUDE.md`

## Goal

Authors can add a caption track to a project, type / drag / trim caption clips beside the audio row, and see the active caption rendered as a text overlay on the preview during playback. SRT and VTT files can be round-tripped through the studio. All edits go through the unified undoable command store.

## Design

New engine track kind + a studio row. Captions are **their own track type**, peer to audio — not a sub-track of audio. Rendering is a DOM overlay above the compositor for session 16; baking into the exported frame is session 18's problem.

**Engine (`packages/engine/src/timeline/`)**

- `CaptionClip = { id: string; start: number; end: number; text: string }` — no keyframes, text is per-clip constant.
- `CaptionTrack = { id: string; kind: 'caption'; clips: CaptionClip[] }`.
- Extend `TrackKind` with `Caption = 'caption'` and add `isCaptionTrack`.
- Pure `evaluateCaptionTrack(track, time): CaptionClip | undefined` — returns the clip whose `[start, end)` contains `time`, or `undefined`. Ties (overlapping clips) resolve to the latest-starting clip.
- `createCaptionTrack` / `createCaptionClip` factories in `factories.ts`.
- `applyTimeline` is unchanged — captions don't mutate scene nodes; the studio reads `evaluateCaptionTrack` directly for the overlay.

**Engine (`packages/engine/src/captions/`)** — new module.

- `parseSRT(text): CaptionClip[]` — tolerant of CRLF, BOM, blank-line delimited blocks, `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamps, multi-line cue body joined with `\n`. Ignores numeric index header.
- `parseVTT(text): CaptionClip[]` — strips `WEBVTT` preamble + `NOTE` / `STYLE` / `REGION` blocks; accepts `.` or `,` in timestamp fraction.
- `serializeSRT(clips): string` / `serializeVTT(clips): string` — emits sorted-by-start cues. Generates ids during parse (`crypto.randomUUID()`).
- Exported from the engine public `index.ts`.

**Project schema (`packages/engine/src/project/schema.ts`)**

- Bump to `CURRENT_SCHEMA_VERSION = 3`.
- Add `CaptionClipSchema`, `CaptionTrackSchema`; union `TrackSchema` to include it.
- `migrateV2ToV3(input)` — pure version bump (no field changes to existing tracks).

**Studio timeline (`apps/studio/src/features/timeline/`)**

- `CaptionTrackRow.tsx` — body drag, left/right trim (mirrors `AudioTrackRow` shape), double-click opens inline `<textarea>` editor; blur/Esc commits via `setCaptionTextCommand`. Clip body shows a single-line truncated preview.
- Raw setters on `TimelineContext`: `moveCaptionClip`, `resizeCaptionClipLeft`, `resizeCaptionClipRight`, `setCaptionText`, `addCaptionClip`, `removeCaptionClip`, `addCaptionTrack`, `removeCaptionTrack`.
- Undoable commands in `commands.ts`: `moveCaptionClipCommand`, `resizeCaptionClipLeftCommand`, `resizeCaptionClipRightCommand`, `setCaptionTextCommand`, `addCaptionClipCommand`, `removeCaptionClipCommand`, `addCaptionTrackCommand`, `removeCaptionTrackCommand`. Same setter-style / idempotent pattern as audio commands.
- Clamps at call site: clip min duration `0.05s`, `start ≥ 0`, `end ≤ sceneDuration`.
- `TimelineView` renders caption rows after audio rows.
- Timeline header: "Add captions" button (creates empty caption track) + "Import SRT/VTT" (`<input type="file" accept=".srt,.vtt">` → `parseSRT`/`parseVTT` by extension → single `addCaptionTrackCommand` with parsed clips) + "Export SRT/VTT" (serialize first caption track → Blob URL → anchor download).

**Studio preview**

- `<CaptionOverlay>` — absolutely positioned `<div>` above the compositor canvases inside the existing `PreviewHost`. Reads `useTimeline().timeline.tracks`, filters caption tracks, runs `evaluateCaptionTrack` at `playback.time()`; picks the most recent active clip across all caption tracks. Styles: bottom-anchored (~12% from bottom), center-aligned, max-width 80%, readable body size with a semi-transparent backdrop. Hidden when no active clip.

## Tasks

1. [ ] **Engine caption types + schema v3.** Add `CaptionClip`/`CaptionTrack` to `timeline/types.ts`, `TrackKind.Caption`, `isCaptionTrack`. Factories in `factories.ts`. Pure `evaluateCaptionTrack` in `evaluate.ts`. Valibot schemas + `migrateV2ToV3` in `project/`. Export from public `index.ts`. Tests: factory defaults, evaluator at boundaries + overlap tie-break, migration idempotence.
2. [ ] **SRT/VTT parse + serialize.** New `packages/engine/src/captions/parse.ts` (or `srt.ts` + `vtt.ts` split). Pure functions + unit tests covering BOM, CRLF, multi-line cues, VTT preamble/NOTE stripping, SRT `,` vs VTT `.` fraction, roundtrip.
3. [ ] **Studio raw setters + caption commands.** Extend `TimelineContext` with the caption mutation API. Add the 8 caption commands in `commands.ts`. Unit-test at least `moveCaptionClipCommand` and `setCaptionTextCommand` (idempotent re-apply).
4. [ ] **Caption row UI.** `CaptionTrackRow.tsx` + styles — body drag, left/right trim wired to raw setters during drag with command push on `pointerup`, double-click → `<textarea>` inline editor that commits on blur/Enter (Shift+Enter = newline), Esc cancels. Selection + delete (`Backspace` on selected clip).
5. [ ] **Preview caption overlay.** `<CaptionOverlay>` inside `PreviewHost`. Reads timeline caption tracks + `playback.time()`, shows the active clip's text with session-consistent styling. No layout shift on empty state.
6. [ ] **Track + file-format buttons.** Timeline header buttons for "Add captions", "Import SRT/VTT", "Export SRT/VTT". Import parses + pushes a single `addCaptionTrackCommand`. Export serializes the first caption track; if none present, button is disabled. Hotkey `C` toggles caption-overlay visibility on the preview (dev convenience).

## Non-goals

- **Keyframed / per-word animated captions.** Text is per-clip constant this session.
- **Linking a caption track to a specific audio track.** Caption tracks are peer-level in v1. Visual grouping / auto-bind to audio deferred to the polish pass.
- **Rendering captions into the exported video.** Export pipeline lands in session 18 and will consume `evaluateCaptionTrack` on its own. Session 16 ships DOM-overlay-only.
- **Styling controls (font, colour, position per-track).** Captions use a single built-in style.
- **ASS/SSA import, auto-transcription, per-speaker labelling.** Out of scope.
- **Snap to playhead / neighbouring audio clip boundaries.** Deferred along with the shared snap manager.
- **Peak-style track-level mute.** Captions are always visible if the overlay is shown; per-track toggle isn't worth the UI surface yet.

## Verification

- `test-runner` green across `bun test` / `bun run typecheck` / `bun run lint`.
- Manual check in `bun run dev` with a project:
  - Click "Add captions" → empty caption row appears.
  - Double-click the lane at a time → new caption clip at that time (default 2s) with editor focused.
  - Type text, blur → preview shows the text in the overlay when the playhead enters the clip.
  - Drag body / trim both handles → clip moves / resizes, overlay text updates live.
  - `⌘Z` undoes the last caption edit (move, trim, text, add, delete) and crosses surfaces with audio/timeline edits in history.
  - Import an SRT → caption track appears with parsed clips at correct times.
  - Export SRT → downloaded file re-imports with identical clips (roundtrip).
  - Reload page → caption track persists (timeline.json has v3 schema, loads clean).

---

At wrap-up, append one line summarising what shipped to `plans/overview.md`'s **Progress log** and update the **Current state** paragraph. Do not add an Outcome section here.
