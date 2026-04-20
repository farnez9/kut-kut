# features/audio

Owns decoded `AudioBuffer`s, `Peaks`, the `AudioContext`, and the `AudioPlayer` for the active project. The engine scheduler (`createAudioPlayer`) stays transition-driven; this feature provides the buffers and the reactivity seam.

See ADR 0009 (audio model, engine scheduler) and ADR 0010 (studio wiring).

## Contract

- `<AudioProvider>` mounts **inside** `<TimelineProvider>` (reads timeline tracks + commands) and inside `<PlaybackProvider>` (via `AudioPlayerHost`). Exposes:
  - `buffers()` — `Map<string, AudioBuffer>` keyed by `clip.src` (project-relative).
  - `peaks()` — `Map<string, Peaks>` keyed the same way.
  - `decodeState()` — `Map<string, "pending" | "ready" | "error">`.
  - `importFile(file)` — upload via plugin → decode → peaks → `addAudioTrackCommand`.
  - `importState()` / `importError()` — surfaced by the timeline's import error banner.
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

## Import

`importFile(file)`:

1. `ensureContext()` — inside the click handler's gesture.
2. `uploadAsset(projectName, file)` → `assets/<basename>` via the plugin.
3. `fetch(/@fs/<abs>/<path>)` → `ArrayBuffer` → `decodeAudio` → `computePeaks` → stash under `path`.
4. `addAudioTrackCommand(timeline, track)` — undoable; ⌘Z removes the track (buffer + peaks remain cached in-memory until project swap).

Collisions: `uploadAsset` overwrites by name (current plugin behavior). Acceptable for v1.

## Non-scope

- Peak-cache to disk (`projects/<name>/assets/.peaks/<hash>.bin`). Deferred pending evidence of slow startup.
- Inspector UI for audio tracks/clips. Track mute + gain live inline on the timeline row; clip-level edits are data-model-only.
- Clip move / trim for audio clips. Sessions 14+.
- Drag-and-drop import, multi-file batch.
- Voiceover recording (session 14), captions (15), TTS (16), export audio (17).
