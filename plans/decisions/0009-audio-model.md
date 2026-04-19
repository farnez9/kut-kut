# 0009 — Audio model, decode boundary, and playback scheduling

**Date:** 2026-04-19
**Status:** accepted
**Context:** session 12 (Engine: audio core). First audio code in the engine; sets the data model and playback strategy that sessions 13 (studio audio panel), 14 (voiceover recording), 16 (TTS output), and 17 (export pipeline) will all depend on.

## Decision

Audio enters the timeline as a new track variant (`kind: "audio"`) with clips that reference source assets by project-relative path and carry their own gain/mute. The engine decodes bytes into `AudioBuffer`s through a thin `decodeAudio` wrapper and computes waveform peaks offline via `computePeaks`. A `createAudioPlayer` hooks a live `PlaybackController` to Web Audio: on each play/seek tick it schedules one `AudioBufferSourceNode` per clip that currently covers the playhead, routed through a per-track `GainNode`; on pause/seek it stops everything and re-schedules. Schema version bumps to 2 with an identity migration from v1.

```ts
// packages/engine/src/timeline/types.ts (additions)
export type AudioClip = {
  id: string;
  src: string;      // project-relative, e.g. "assets/voice.mp3"
  start: number;    // seconds on the project timeline
  end: number;
  offset: number;   // seconds into the source buffer
  gain: number;
  muted: boolean;
};

export type AudioTrack = {
  id: string;
  kind: typeof TrackKind.Audio;
  clips: AudioClip[];
  gain: number;
  muted: boolean;
};

export type Track = NumberTrack | AudioTrack;
```

`TrackKind` gains `Audio = "audio"`. `AudioTrack` has **no `target`** field (unlike `NumberTrack`) because audio doesn't drive scene properties — it just plays.

## Data model: why these fields and no others

- **`src: string` (not a Blob / AudioBuffer).** The engine can't read disk; the studio resolves `src` against `projects/<name>/` via the Vite plugin and hands the engine the decoded `AudioBuffer` through `createAudioPlayer`'s `buffers` map. The schema stays JSON-safe and git-diffable.
- **`start` + `end` + `offset` (three numbers, not two).** `start`/`end` are where the clip sits on the project timeline; `offset` is where playback enters the source buffer. Trimming the left of a clip adjusts `start` **and** `offset` together; trimming the right adjusts `end` only. Without `offset`, a left-trim would re-encode or re-reference a shorter buffer.
- **`gain` + `muted` per clip *and* per track.** Track-level mute is the common mixer control ("mute dialog"); per-clip mute handles "this take is broken, skip it without deleting it." Gain mirrors the same split. Effective clip audibility is `track.muted ? 0 : (clip.muted ? 0 : track.gain * clip.gain)`.
- **No envelopes / fades / pitch / rate.** Crossfades, fade-ins, time-stretching — deferred. The schema can grow additive fields without a version bump.
- **No per-clip loop / reverse.** Same reasoning.

### Why not reuse `NumberTrack`'s `Clip<T>` shape

`Clip<number>` has `keyframes: Keyframe<number>[]` and no `src`. Audio clips have a buffer reference and no keyframes. Forcing one shape either makes every `NumberClip` carry a nullable `src` (weird) or every `AudioClip` carry a nullable `keyframes` array (wasteful). Variant on `TrackKind` keeps both clean. `AudioClip` is its own interface; `Clip<T>` stays number-only.

## Decode boundary

```ts
// packages/engine/src/audio/decode.ts
export const decodeAudio = (ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> =>
  ctx.decodeAudioData(data);
```

**The engine never fetches.** The studio loads bytes (via the Vite dev plugin's asset endpoint or a project-boot hydrate step) and passes `ArrayBuffer`s in. `decodeAudio` is a three-line wrapper — its job is to keep the only `decodeAudioData` call site inside `@kut-kut/engine` so the studio doesn't need to know about `BaseAudioContext` directly. Errors from the browser propagate unchanged.

### Why not `decodeAudio(src)` that fetches for you

- Engine would need `fetch` or `URL` resolution, which couples it to how the studio serves assets.
- Tests would need a fake fetcher even when they don't care about transport.
- The studio already owns asset serving (plugin in session 06); moving the fetch into the engine duplicates responsibility.

## Peaks

```ts
export type AudioBufferLike = {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData: (channel: number) => Float32Array;
};

export type Peaks = {
  min: Float32Array;
  max: Float32Array;
  bucketCount: number;
  sampleRate: number;
};

export const computePeaks = (buffer: AudioBufferLike, bucketCount: number): Peaks;
```

Bucket count is the caller's choice (typically equal to the waveform's pixel width). The function mixes channels to mono by averaging, walks the samples, records `(min, max)` per bucket. Pure compute, no DOM. `AudioBufferLike` means tests can pass a plain `{ numberOfChannels, sampleRate, length, getChannelData }` without mocking the full Web Audio API.

Studio caches `Peaks` to `projects/<name>/assets/.peaks/<hash>.bin` (session 13 — not this session). The engine doesn't know about the cache.

## Playback scheduling

```ts
export type AudioPlayerOptions = {
  context: AudioContext;
  destination?: AudioNode;                     // defaults to context.destination
  tracks: Accessor<Track[]>;
  buffers: Accessor<Map<string, AudioBuffer>>; // keyed by clip.src
  playback: PlaybackController;
};
export type AudioPlayer = { dispose: () => void };
export const createAudioPlayer: (opts: AudioPlayerOptions) => AudioPlayer;
```

### Rule

The player subscribes to `playback.onTransition(...)` — a callback fired synchronously on play, pause, seek, restart, and auto-pause at end-of-timeline. On each transition:

1. Stop every currently-scheduled source (`node.stop(0)`, disconnect).
2. Prune per-track `GainNode`s for tracks that no longer exist.
3. If `playback.state() !== "playing"`, done.
4. Read `t = playback.time()` imperatively. For each audio track:
   - Reuse (or create) the track's `GainNode`, set `gain.value = track.muted ? 0 : track.gain`.
   - If the track level is `0`, skip scheduling sources for it — the gain node stays connected so the UI can reflect its state.
   - For each clip where `clip.start <= t < clip.end`, `buffers().has(clip.src)`, and the effective clip level is non-zero:
     - Create a `BufferSource` from the buffer and a per-clip `GainNode` set to `clip.muted ? 0 : clip.gain`.
     - `source.start(context.currentTime, clip.offset + (t - clip.start))`.
     - `source.stop(context.currentTime + (clip.end - t))`.
     - Connect `source → clipGain → trackGain → destination`.

Per-track `GainNode`s persist across reschedules so that a mute toggle during playback doesn't click. Per-clip sources (and their clip-local gain nodes) are disposable — rebuilt every cycle.

### Why a callback, not `createEffect`

`createEffect` doesn't run under Solid's SSR build, which is what `bun test` imports. Tests need the player to react synchronously when they call `playback.play()` / `pause()` / `seek()`. A plain callback invoked from the controller's method bodies runs the same way in both environments. It also keeps the player's dependency on `PlaybackController` narrow and explicit — no hidden signal graph.

### Why "re-schedule on every time tick" isn't a problem

`playback.time()` updates every animation frame during playback — that would be 60 rebuilds per second if we tracked it. We don't: `onTransition` fires only on state/seek transitions, not on ticks. The free-running `AudioBufferSourceNode`s stay synced with the audio clock between transitions; the scene timeline and the audio clock are allowed to drift by a frame or two — imperceptible.

Clips that *start* later in the same track are not pre-scheduled; they get picked up when the playhead crosses their `start` — but the playhead crossing alone isn't a transition, so we miss that boundary on the current scheduler. Accepted tradeoff for this session (see "Why 'only one active clip per track at a time'" below). When it bites, the fix is a short frame-granular watcher that fires `onTransition`-style rebuilds on clip-boundary crossings.

### Why "only one active clip per track at a time"

Lookahead scheduling (queue the next clip while the current one plays) would let the OS audio thread handle the gap seamlessly. But:

- The project is ≤ 10-minute shorts with a handful of audio clips; gaps between clips are common and usually intentional.
- Rescheduling on playhead crossing a clip boundary costs one `createBufferSource` call — microseconds.
- Lookahead complicates seek: you'd cancel queued-but-unstarted sources.

Revisit if users report audible gaps at clip boundaries. The fix is additive: schedule the next clip speculatively and cancel on seek.

### Why no `playbackRate`

`PlaybackController` today has `time` / `state` / `seek` only — no rate. Adding one affects the timeline clock everywhere, not just audio. Out of scope for this session; when rate lands, `BufferSource.playbackRate` pairs with it trivially.

## Schema version bump

`CURRENT_SCHEMA_VERSION: 2`. Migration v1 → v2 is identity: v1 projects have only number tracks, which are valid in v2's widened `TrackSchema`. `migrate` routes `version === 2` straight through; `version === 1` projects go through a one-line migration that stamps `schemaVersion = 2` and returns. v0 doesn't exist.

The project hasn't shipped any v1 fixtures outside the repo (local dev tool, no deployed app), so the "migration" is really "re-stamp the version number to future-proof the code path." Writing it out now means session 13+ doesn't have to revisit.

### Why bump instead of make audio tracks optional in v1

The `TrackSchema` variant already rejects anything whose `kind` isn't a known value — adding `"audio"` changes what v1 accepts. That's a schema change by the engine's own rules (`packages/engine/CLAUDE.md`: "Changing the project schema is a breaking change"). Version bumps exist for exactly this.

## Out of scope (session 12)

- **Studio UI** — audio-track lane in the timeline, waveform drawing, per-track mixer. Session 13.
- **Asset hashing / peak caching** — studio concern under `projects/<name>/assets/.peaks/`. Session 13.
- **MediaRecorder / voiceover capture.** Session 14.
- **Captions / subtitles.** Session 15.
- **TTS adapters.** Session 16.
- **Export audio encoding.** Session 17 (WebCodecs `AudioEncoder` + mp4-muxer audio track).
- **Crossfades, fades, per-clip envelopes.**
- **Playback rate, pitch correction.**
- **Spatial / per-node audio.**
- **Multi-clip simultaneous scheduling / lookahead.**
- **Inter-clip crossfade at track boundaries.**

## Alternatives considered

- **One unified `Clip<T>` with `T = AudioSource | number`.** Rejected — forces every call site to check the union. The track-kind variant already exists for this; use it.
- **Engine fetches audio bytes.** Rejected — couples engine to transport. Studio owns asset IO.
- **`AudioTrack` gets a `target` for consistency.** Rejected — nothing to target. Adds a nullable field for zero benefit.
- **Per-sample peaks instead of min/max per bucket.** Rejected — bucket min/max is what waveform rendering consumes; per-sample just defers the reduction.
- **`<audio>`-element playback.** Rejected — `AudioContext` is already required for export (`AudioEncoder`) and gives precise scheduling, gain nodes, analyser taps. Keeping one audio pipeline is simpler than two.
- **Command-bus integration for audio edits (gain/mute/clip moves) this session.** Out of scope — engine session, not studio. Session 13 will wrap audio mutations as commands.
- **Lookahead scheduling (queue clip N+1 while clip N plays).** Rejected for v1; see "Why 'only one active clip per track at a time'" above.

## Consequences

- New engine module `packages/engine/src/audio/` with `decode.ts`, `peaks.ts`, `player.ts`, `index.ts`.
- `packages/engine/src/timeline/types.ts` widens `Track` and adds `TrackKind.Audio`. `factories.ts` adds `createAudioClip` and `createAudioTrack`. `applyTimeline` skips audio tracks.
- `packages/engine/src/project/schema.ts` bumps `CURRENT_SCHEMA_VERSION` to 2, extends `TrackSchema` variant, adds `AudioClipSchema` / `AudioTrackSchema`.
- `packages/engine/src/project/migrations.ts` handles v1 → v2 (stamp version; no payload changes).
- `packages/engine/src/project/deserialize.ts` + `serialize.ts` learn the audio variant.
- Public API (`packages/engine/src/index.ts`) gains: `AudioClip`, `AudioTrack`, `AudioClipJSON`, `AudioTrackJSON`, `createAudioClip`, `createAudioTrack`, `isAudioTrack`, `isNumberTrack`, `decodeAudio`, `computePeaks`, `Peaks`, `AudioBufferLike`, `createAudioPlayer`, `AudioPlayer`, `AudioPlayerOptions`.
- `PlaybackController` gains two additive things: a `seekToken: Accessor<number>` that bumps on every `seek()` / `restart()` (lets other consumers distinguish seek-driven time changes from tick-driven ones via `createEffect` in the browser), and an `onTransition(fn)` callback used by the audio player in place of `createEffect` so scheduling is synchronous under both the browser runtime and the SSR build that `bun test` uses.

## When to revisit

- **Lookahead scheduling.** If users report audible artefacts at clip boundaries.
- **Envelopes / fades.** First user ask; extend `AudioClip` with an optional `envelope` field, no version bump.
- **Playback rate.** When the timeline gains a global rate control, pipe it through `AudioBufferSourceNode.playbackRate`.
- **Peak storage format.** Today `Float32Array`; if size hurts, quantize to `Int8Array` with a per-file scale factor.
- **`<audio>` fallback.** Only if a target browser lacks `AudioContext` support — not a real constraint today.
