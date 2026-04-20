# Session 12 — Engine: audio core

**Estimated:** ~2h focused
**Depends on:** Session 02 (project schema + migrations), Session 03 (timeline + `PlaybackController`)
**Status:** done
**Links:** `plans/decisions/0009-audio-model.md` (this session), `packages/engine/CLAUDE.md`

## Goal

End state: the engine knows about audio. `AudioTrack`/`AudioClip` live in the timeline schema (schema bumped to v2, v1→v2 migration is identity). `decodeAudio`, `computePeaks`, and `createAudioPlayer` are exported. The player observes a `PlaybackController`'s `state` + `time`, schedules `AudioBufferSourceNode`s for audio clips that cover the playhead, and stops/reschedules on pause/seek. All new code has unit tests driven by an injected fake `AudioContext`. No studio wiring this session — that's session 13.

## Design

ADR 0009 locks the data model, decode boundary, and scheduling rule. Summary here — rationale there.

### Schema additions (`packages/engine/src/project/schema.ts`)

```ts
AudioClipSchema    = { id, src: string, start: number, end: number, offset: number, gain: number, muted: boolean }
AudioTrackSchema   = { id, kind: "audio", clips: AudioClip[], gain: number, muted: boolean }
TrackSchema        = variant("kind", [NumberTrackSchema, AudioTrackSchema])
CURRENT_SCHEMA_VERSION = 2
```

`src` is a project-relative path (e.g. `"assets/voice.mp3"`). Engine never resolves it — the studio loads bytes. Migration v1→v2 is identity (audio tracks simply absent in v1 projects). `TrackKind` enum gains `Audio = "audio"`.

### Engine types & factories (`packages/engine/src/timeline/`)

- `types.ts` — add `AudioClip`, `AudioTrack`; widen `Track = NumberTrack | AudioTrack`. Helper `isNumberTrack`, `isAudioTrack`.
- `factories.ts` — `createAudioTrack({ id?, clips?, gain?, muted? })`, `createAudioClip({ id?, src, start, end, offset?, gain?, muted? })`. Defaults: `gain=1`, `muted=false`, `offset=0`.
- `apply.ts` — `applyTimeline` ignores audio tracks (they don't drive scene props). No change to `NumberTrack` handling.
- `evaluate.ts` — unchanged. Audio is not evaluated here.

### Decode (`packages/engine/src/audio/decode.ts`)

```ts
export const decodeAudio = (ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer>;
```

Thin wrapper over `ctx.decodeAudioData`. Errors propagate. Engine doesn't fetch bytes — the studio passes them in.

### Peaks (`packages/engine/src/audio/peaks.ts`)

```ts
export type Peaks = { min: Float32Array; max: Float32Array; bucketCount: number; sampleRate: number };
export const computePeaks = (buffer: AudioBufferLike, bucketCount: number): Peaks;
```

Pure compute; mixes channels down to mono by averaging, then fills min/max per bucket. `AudioBufferLike = { numberOfChannels, sampleRate, length, getChannelData(ch) }` so tests can pass plain objects.

### Player (`packages/engine/src/audio/player.ts`)

```ts
export type AudioPlayerOptions = {
  context: AudioContext;
  destination?: AudioNode;                       // defaults to context.destination
  tracks: Accessor<Track[]>;
  buffers: Accessor<Map<string, AudioBuffer>>;   // keyed by clip.src
  playback: PlaybackController;
};
export type AudioPlayer = { dispose: () => void };
export const createAudioPlayer = (opts: AudioPlayerOptions): AudioPlayer;
```

Scheduling rule (spelled out in ADR 0009):

- On `state() === "playing"`: for each audio track (not muted) and each clip whose `[start, end)` covers `t = playback.time()`, create a `BufferSource` playing `buffer` at offset `offset + (t - clip.start)`, started at `context.currentTime`, stopped at `context.currentTime + (clip.end - t)`. Route through a per-track `GainNode`.
- On `state()` → `paused`: stop all active sources immediately.
- On seek during `playing`: stop + rebuild schedule at new time.
- On `tracks`/`buffers` identity change: stop + rebuild if currently playing.
- `dispose`: stop all, disconnect gain nodes, no further effects.

Lookahead / scheduling horizon beyond the current clip is **out of scope** — we only schedule the active clip. Clips starting later in the same track will be scheduled when the playhead reaches them (on next `time()` tick inside `playing`, a brand-new clip crossing the playhead triggers a rebuild). This keeps the model simple; revisit if drift is audible.

Tests inject a fake context (records `createBufferSource`, `createGain`, `start`, `stop`, `connect`, `disconnect` calls) plus a test-friendly `PlaybackController` built with the existing manual scheduler.

**Additive changes to `PlaybackController`:**
- Add `seekToken: Accessor<number>` that bumps on every `seek()` / `restart()` call.
- Add `onTransition: (fn: () => void) => () => void` — synchronous callback invoked after every state/seek/end transition (play, pause, seek, restart, auto-pause at end). Returns an unsubscribe function.

The player subscribes via `onTransition` (not `createEffect`) so it reconciles synchronously in both the browser and under Solid's SSR build (the one `bun test` uses). `time` is read imperatively inside the reconcile for clip-offset math — a 60 fps tick doesn't fire `onTransition`, so the audio graph isn't rebuilt every frame. Tracks/buffers accessors are read imperatively inside reconcile as well; if those change outside a transition, the caller is responsible for nudging a reconcile (studio session will wire this up via an effect).

### Public API (`packages/engine/src/index.ts`)

Add: `AudioClip`, `AudioTrack`, `AudioClipJSON`, `AudioTrackJSON`, `createAudioClip`, `createAudioTrack`, `isAudioTrack`, `isNumberTrack`, `decodeAudio`, `computePeaks`, `Peaks`, `AudioBufferLike`, `createAudioPlayer`, `AudioPlayer`, `AudioPlayerOptions`.

## Tasks

Ordered. Each task ≈ 15–45 min.

1. [x] **ADR 0009 — audio model & scheduling.** Data model (AudioTrack/AudioClip fields, no track target), decode boundary (studio fetches, engine decodes), scheduling rule + why "one active clip at a time", schema version bump, out-of-scope list (crossfades, per-clip envelopes, mic capture, playback rate, seek-during-pause pre-warm). `plans/decisions/0009-audio-model.md`. ~15 min.
2. [x] **Schema v2 + migration.** Extend `TrackSchema` variant, bump `CURRENT_SCHEMA_VERSION` to 2, add v1→v2 identity migration in `project/migrations.ts`, update deserialize/serialize paths, add `AudioClipJSON`/`AudioTrackJSON` exports. Roundtrip test: a project with one number track + one audio track serializes, parses, matches. Migration test: v1 JSON deserializes as v2 with zero audio tracks. ~30 min.
3. [x] **Timeline types + factories.** Add `AudioClip`, `AudioTrack`, widen `Track`, add `TrackKind.Audio`, `isAudioTrack`, `isNumberTrack`. `createAudioTrack`/`createAudioClip` with defaults. `applyTimeline` skips audio tracks. Tests for factories + `applyTimeline` no-op on audio. ~25 min.
4. [x] **Decode + peaks.** `audio/decode.ts` (3-line wrapper). `audio/peaks.ts` with `computePeaks(buffer, n)` and `AudioBufferLike`. Tests: synthesized mono sine buffer → peaks have expected bucket count and min/max bounds; stereo buffer averages channels; `bucketCount <= 0` throws. ~25 min.
5. [x] **Playback `seekToken` + `onTransition` + audio player.** Add `seekToken: Accessor<number>` (bumped in `seek`/`restart`) and `onTransition` (fired synchronously on play/pause/seek/restart/end-auto-pause) to `PlaybackController`. Then `audio/player.ts` — subscribes to `onTransition` and rebuilds the schedule by reading `state`/`time`/`tracks`/`buffers` imperatively. Build schedule = "active clips covering `t` from non-muted tracks with a loaded buffer". Fake-context tests cover: play at t=0 schedules expected sources; pause stops all; seek rebuilds; muted track contributes nothing; missing buffer for a clip is skipped silently; dispose unsubscribes + stops sources. ~40 min.
6. [x] **Exports + verification sweep.** Wire new symbols into `packages/engine/src/index.ts` and any sub-`index.ts` files. Run `bun test`, `bun run typecheck`, `bun run lint`. Fill Outcome. ~10 min.

## Non-goals

- **Studio UI / timeline track rendering for audio.** Session 13.
- **Voiceover recording / MediaRecorder wrapper.** Session 14.
- **Captions.** Session 15.
- **Crossfades, fades, per-clip volume envelopes.** Later polish.
- **Non-AudioContext playback** (e.g. `<audio>` element). Not needed; WebAudio handles everything.
- **Playback rate control** for audio. Engine timeline has no rate concept yet.
- **Waveform caching on disk.** Studio concern (`assets/.peaks/`), session 13.
- **Multi-clip simultaneous scheduling ahead of time.** One active clip per track at a time; clips scheduled when playhead crosses them.
- **Mic input / Web Audio capture nodes.**
- **Per-node audio** (attaching audio to scene nodes / spatial audio).

## Verification

- `bun test` green, including `project/roundtrip.test.ts` (updated), `project/migrations.test.ts` (new case), `timeline/factories.test.ts` (new), `audio/peaks.test.ts` (new), `audio/player.test.ts` (new).
- `bun run typecheck`, `bun run lint` green.
- `plans/decisions/0009-audio-model.md` exists and is linked from this spec.
- `packages/engine/src/index.ts` exports every new symbol listed above.
- `bun run dev` still boots cleanly (no studio changes this session — regression check only).
