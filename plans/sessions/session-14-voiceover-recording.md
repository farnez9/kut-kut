# Session 14 — voiceover-recording

**Estimated:** ~2h focused
**Depends on:** sessions 12 (audio core), 13 (studio audio panel)
**Status:** done
**Links:**
- `plans/decisions/0009-audio-model.md`
- `plans/decisions/0010-studio-audio-wiring.md`
- `apps/studio/src/features/audio/CLAUDE.md`

## Goal

From the timeline header, the user can click a "Record voiceover" button, grant microphone permission, watch playback advance while they speak, click again to stop, and land a new audio track whose clip starts at the playback time the recording began. The blob is persisted via the existing plugin `uploadAsset` endpoint as `assets/voiceover-YYYYMMDD-HHMMSS.<ext>`, decoded through the same path as import, and added to the timeline as an undoable `addAudioTrackCommand`. ⌘Z removes it; ⌘⇧Z re-adds it.

## Design

Reuse the session-13 pipeline end to end. The recorder is a thin MediaRecorder façade that produces a `File`, hands it to the same "upload → fetch → decode → peaks → addAudioTrackCommand" path `importFile` already uses. The only new concept is the clip's `start` is the playback time captured at recorder-start (not zero).

**State in `AudioProvider`:**

```ts
recordState: Accessor<"idle" | "requesting" | "recording" | "processing" | "error">;
recordError: Accessor<Error | null>;
recordElapsed: Accessor<number>;   // seconds, ticking while recording
recordSupported: () => boolean;     // feature-detect MediaRecorder + getUserMedia
startRecording: () => Promise<void>;
stopRecording: () => Promise<void>;
cancelRecording: () => void;        // abort without writing to disk
```

**Flow:**

1. Click → `startRecording()`. Feature-detect; if unsupported, set error and bail.
2. `ensureContext()` (user gesture); `navigator.mediaDevices.getUserMedia({ audio: true })`.
3. Capture `recordStartTime = playback.time()`. Call `playback.play()`.
4. Construct `MediaRecorder(stream, { mimeType })` where `mimeType` comes from `pickRecordingMime()` (prefers `audio/webm;codecs=opus`, falls back to `audio/webm`, `audio/mp4`).
5. Collect `dataavailable` chunks; on `stop`, assemble `Blob` → wrap in `File(…, makeRecordingFilename(now, ext))`.
6. `playback.pause()`. Reuse the same inner steps as `importFile`: `uploadAsset` → `fetch /@fs/` → `decodeAudio` → `computePeaks` → store → `addAudioTrackCommand(track)` where the track's clip is `{ src, start: recordStartTime, end: recordStartTime + buffer.duration, offset: 0 }`.
7. On error at any step: stop the stream tracks, set `recordState = "error"`, surface via error banner; partial asset on disk is acceptable (same as `importFile` today).

**New pure helpers (`recording.ts`, with `recording.test.ts`):**

- `pickRecordingMime(): string | null` — returns the first `MediaRecorder.isTypeSupported(...)` hit from a static preference list, or null.
- `extensionForMime(mime: string): string` — `webm`/`m4a`/`mp4` mapping.
- `makeRecordingFilename(now: Date, ext: string): string` — `voiceover-YYYYMMDD-HHMMSS.<ext>`, always passes `ASSET_NAME_RE`.

**New component:** `RecordButton.tsx` (lucide `Mic` / `Square`; pulsing dot + `mm:ss` while recording; disabled when `!recordSupported()`).

**Wiring:** `RecordButton` mounts next to `TimelineImportButton` in the header. A `TimelineRecordError` banner (parallel to `TimelineImportError`) surfaces `recordError()`.

**Non-gesture AudioContext note.** `ensureContext()` is called inside the record click handler; it satisfies the autoplay policy and matches the existing import flow.

## Tasks

1. [x] `recording.ts` + `recording.test.ts` — `pickRecordingMime`, `extensionForMime`, `makeRecordingFilename`. Tests: mime fallback order, filename regex/format, extension mapping. (≈20 min)
2. [x] Refactor `AudioProvider` so the "upload → decode → add track" tail is reusable by both `importFile` and `finishRecording(file, startAt)`. Extract a private `ingestAudioFile(file: File, startAt: number): Promise<void>`. Keep `importFile` behaviour identical. (≈25 min)
3. [x] Add recorder state/methods to `AudioProvider`: `recordState`, `recordError`, `recordElapsed`, `recordSupported`, `startRecording`, `stopRecording`, `cancelRecording`. Manage `MediaStream` lifetime (stop all tracks on stop/cancel/error/cleanup). Widen `AudioContextValue` in `context.ts` + re-export. (≈35 min)
4. [x] `RecordButton.tsx` — idle/recording/processing/error visuals, elapsed timer, `disabled` when unsupported; `features/audio/index.ts` export. (≈20 min)
5. [x] Mount `RecordButton` next to `TimelineImportButton` and add `TimelineRecordError` banner beside `TimelineImportError`. (≈10 min)
6. [x] Update `apps/studio/src/features/audio/CLAUDE.md`: add a "Recording" section mirroring "Import", remove voiceover from Non-scope. (≈10 min)
7. [~] Manual verification in browser (see below). Delegate to `test-runner` for automated checks; `code-reviewer` at wrap-up. (Automated checks PASS; manual mic verification is on the user — agent can't drive `getUserMedia`.) (≈15 min)

## Non-goals

- **No live monitoring** (user hearing their own mic).
- **No input device picker** — always default device via `getUserMedia({ audio: true })`.
- **No input level meter** or in-progress waveform preview.
- **No pause/resume** mid-recording; single stop is terminal.
- **No recording controls inspector**; retry = re-record (undo previous first).
- **No peak-cache to disk** (ADR 0010 non-goal still stands).
- **No ffmpeg or re-encoding.** Whatever container MediaRecorder emits is what lands in `assets/` — WebCodecs decoder handles webm/opus and mp4/aac in Chromium.
- **No `@fs` URL change** or new plugin endpoint — reuse `uploadAsset` and `/@fs/<abs>/<path>` fetch verbatim.
- **No ADR this session.** The design is a thin composition of existing machinery; if a non-obvious constraint surfaces mid-session, write the ADR then.

## Verification

Delegate automated runs to the `test-runner` sub-agent:

- `bun test` — includes new `recording.test.ts` cases.
- `bun run typecheck` — `AudioContextValue` widening propagates cleanly.
- `bun run lint` — Biome clean.

Manual (Chromium), report honestly what was tested:

- Click Record → grant mic → playback begins → after a few seconds, click Stop → a new audio track appears with the waveform correctly positioned at the start time and of the right duration.
- ⌘Z removes the track; ⌘⇧Z re-adds it (unified command store).
- Deny mic permission → error banner surfaces, `recordState` returns to `idle` after dismiss.
- Refresh the page → the new track persists (timeline.json written) and its waveform re-decodes from disk.
- Feature-detect path: confirm button is disabled and tooltip hints when `MediaRecorder` / `getUserMedia` absent (can simulate by temporarily shadowing in devtools).
