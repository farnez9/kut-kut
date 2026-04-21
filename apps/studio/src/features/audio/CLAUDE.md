# features/audio

Owns decoded `AudioBuffer`s, `Peaks`, the `AudioContext`, the `AudioPlayer`, and microphone recording for the active project. The engine scheduler (`createAudioPlayer`) stays transition-driven; this feature provides the buffers and the reactivity seam.

See ADR 0009 (audio model, engine scheduler) and ADR 0010 (studio wiring).

## Contract

- `<AudioProvider>` mounts **inside** `<TimelineProvider>` (reads timeline tracks + commands) and inside `<PlaybackProvider>` (needs `time()` at record-start; also via `AudioPlayerHost`). Exposes:
  - `buffers()` — `Map<string, AudioBuffer>` keyed by `clip.src` (project-relative).
  - `peaks()` — `Map<string, Peaks>` keyed the same way.
  - `decodeState()` — `Map<string, "pending" | "ready" | "error">`.
  - `importFile(file)` — upload via plugin → decode → peaks → `addAudioTrackCommand`.
  - `importState()` / `importError()` — surfaced by the timeline's import error banner.
  - `recordSupported()` — `MediaRecorder` + `getUserMedia` feature detect.
  - `startRecording()` / `stopRecording()` / `cancelRecording()` — mic capture wired to live playback.
  - `recordState()` / `recordError()` / `recordElapsed()` — UI bindings for `<RecordButton>` and `<RecordError>`.
  - `ensureContext()` / `context()` — lazy `AudioContext`; first call must be inside a user gesture.
- `<AudioPlayerHost>` mounts inside `<AudioProvider>`. Constructs `createAudioPlayer` on first `state() === "playing"`, and a `createEffect` calls `player.reconcile()` whenever buffers change or any audio track's `muted`/`gain`/clip count changes.

## Reactivity seam

The engine's `AudioPlayer` schedules on `PlaybackController.onTransition` only. Studio-side edits (mute toggle, gain release, new track imported) aren't transitions, so the studio calls `player.reconcile()` through a `createEffect` that subscribes to the relevant timeline fields. Keep the effect narrow: it must not read `playback.time()` (which ticks per frame).

## Decode

On mount and on `timeline.tracks` change:

1. `computeDecodeWorkList(tracks, decoded, pending)` — pure helper, tested separately.
2. For each `src` in the work list: `fetch(/@fs/<absolutePath>/<src>)` → `decodeAudio(ctx, bytes)` → `computePeaks(buffer, PEAK_BUCKETS)` → stash.

`absolutePath` comes from `useProject().available()` matched by the current bundle's `name`. `/@fs/` only serves files whose extensions Vite recognises — audio extensions are listed in `apps/studio/vite.config.ts` `assetsInclude` so the dev server returns the raw bytes instead of the SPA fallback.

Peaks are in memory only — no disk cache this session (ADR 0010 non-goal).

## Import and ingest

Both `importFile` (file picker) and `stopRecording` (mic) funnel through a private `ingestAudioFile(file, startAt)`:

1. `uploadAsset(projectName, file)` → `assets/<basename>` via the plugin.
2. `fetch(/@fs/<abs>/<path>)` → `ArrayBuffer` → `decodeAudio` → `computePeaks` → stash under `path`.
3. `addAudioTrackCommand(timeline, track)` with `clip.start = startAt`, `clip.end = startAt + buffer.duration` — undoable; ⌘Z removes the track (buffer + peaks remain cached in-memory until project swap).

`importFile` passes `startAt = 0`. Collisions: `uploadAsset` overwrites by name (current plugin behavior). Acceptable for v1.

## Recording

`startRecording()`:

1. Feature-detect (`recordSupported()`). `ensureContext()` — inside the click handler's gesture.
2. `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`; capture `startAt = playback.time()`. Default constraints are off because they're tuned for voice calls and audibly colour narration/content audio — we want the raw mic input.
3. `new MediaRecorder(stream, { mimeType })` where `mimeType` comes from `pickRecordingMime()` (`audio/webm;codecs=opus` preferred).
4. Kick playback via `playback.play()` and start the elapsed timer.

`stopRecording()` assembles chunks into a `Blob`, wraps as `File(voiceover-YYYYMMDD-HHMMSS.<ext>)`, pauses playback, and calls `ingestAudioFile(file, startAt)`.

`cancelRecording()` detaches recorder handlers, stops the stream tracks, and resets state without writing to disk. `onCleanup` calls it on provider teardown (project swap / HMR).

The container MediaRecorder emits lands verbatim in `assets/`; no re-encoding. Chromium decodes webm/opus and mp4/aac natively through the same `decodeAudio` path as imports.

## Clean unused assets

`<CleanAssetsButton>` in the timeline header calls `pruneAssets(name, keep)` where `keep` is every `clip.src` referenced by any audio track in the current timeline. The plugin's `POST /assets/prune` endpoint lists `assets/`, validates each entry against `ASSET_NAME_RE`, and deletes any file not in `keep`. Returns `{ deleted: string[] }` which the button surfaces via a 4s transient banner.

Track removal (trash icon on the audio row) is a **soft delete** — it removes the track from `timeline.json` only. Keeping the file on disk means ⌘Z restores the track without needing to re-upload. The explicit "Clean" action is the hygiene step when the user wants the folder tidy.

## Trim semantics

Audio-clip drag mirrors number-clip drag (body + left handle + right handle), with one twist:

- **Body drag** moves `start` + `end` together; `offset` is preserved so the audible sample at the clip's left edge stays identical.
- **Left-trim** shifts `start` and `offset` by the same delta (non-slip): the audible sample at any fixed timeline position is unchanged; later samples appear at the clip's new left edge. Clamp at call site — `offset` can't go below 0.
- **Right-trim** moves `end` only; `offset` and `start` untouched. Clamp at call site — `offset + (end - start) ≤ buffer.duration`. If the buffer isn't decoded yet, the buffer-length rail is skipped (harmless — rare).

All three go through raw setters on `TimelineContext` during the drag; a single `moveAudioClipCommand` / `resizeAudioClipLeftCommand` / `resizeAudioClipRightCommand` is pushed on `pointerup`. Drag-in-progress isn't reflected in live audio playback; `createAudioPlayer.reconcile()` re-reads the clip window on the next transition after the drop.

## Non-scope

- Peak-cache to disk (`projects/<name>/assets/.peaks/<hash>.bin`). Deferred pending evidence of slow startup.
- Inspector UI for audio tracks/clips. Track mute + gain live inline on the timeline row; clip-level edits are data-model-only.
- Snap / cross-track drop / multi-select / keyboard nudge / clip-split for audio clips — same deferrals as number clips.
- Drag-and-drop import, multi-file batch.
- Live mic monitoring, input-device picker, level meter, pause/resume mid-recording.
- Captions (16), TTS (17), export audio (18).
