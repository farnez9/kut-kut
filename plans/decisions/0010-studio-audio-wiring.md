# 0010 — Studio audio wiring: buffers, reconcile seam, import flow

**Date:** 2026-04-20
**Status:** accepted
**Context:** session 13 (Studio: audio panel). Builds on ADR 0009 (audio model, decode boundary, playback scheduling). Defines how the studio owns buffers, peaks, AudioContext lifetime, and reactivity so `createAudioPlayer` stays a pure transition-driven scheduler.

## Decision

A new feature slice `apps/studio/src/features/audio/` owns four things the engine deliberately doesn't: (1) decoded `AudioBuffer`s keyed by `clip.src`, (2) in-memory `Peaks` computed on decode, (3) a lazily-constructed `AudioContext` created on first play, (4) a `createEffect` that calls `AudioPlayer.reconcile()` whenever studio-side mutations that aren't playback transitions change what the scheduler should hear (mute, gain, track count, new buffer). Audio imports upload through the existing plugin asset endpoint, decode in-process, then push an `AddAudioTrackCommand` onto the shared command store so undo works like any other edit.

```
<CommandProvider>
  <OverlayProvider>
    <TimelineProvider>
      <PlaybackProvider>
        <AudioProvider>          # buffers, peaks, import; lazy AudioContext
          <AudioPlayerHost>      # owns createAudioPlayer, reconcile effect
          {children}
```

## What lives where

### `AudioProvider` (studio-owned)

```ts
export type AudioContextValue = {
  buffers: Accessor<Map<string, AudioBuffer>>;  // keyed by clip.src
  peaks: Accessor<Map<string, Peaks>>;          // keyed the same way
  decodeState: Accessor<Map<string, "pending" | "ready" | "error">>;
  importFile: (file: File) => Promise<void>;
  context: Accessor<AudioContext | null>;       // null until first play
  ensureContext: () => AudioContext;            // lazy; safe to call from a user gesture
};
```

**Keying by `src` (project-relative path), not by clip id.** Two clips that reference the same file share one buffer and one peaks entry. Storing per-clip would force re-decode on duplication and waste memory on long voiceovers used twice. Project-relative paths already scope to the current project's assets dir — no collision with a different project's identically-named file because the provider's state is remounted on project swap.

### `AudioPlayerHost` (mounted inside `AudioProvider`)

Constructs the `AudioPlayer` once, passes it `{ context, tracks: () => timeline.tracks, buffers: audio.buffers, playback }`. Owns the reactive nudge:

```ts
createEffect(() => {
  for (const t of timeline.tracks) {
    if (!isAudioTrack(t)) continue;
    t.muted; t.gain; t.clips.length;      // read to subscribe
  }
  timeline.tracks.length;
  audio.buffers().size;
  player.reconcile();
});
```

That's the entire studio→engine audio reactivity contract. The `createEffect` lives in the studio (browser-only runtime) and calls the plain function the engine exposes.

## Why `reconcile()` on the player, not reactivity in the engine

ADR 0009 spelled out why scheduling runs on `PlaybackController.onTransition` and not on `createEffect`: the engine's tests run under Solid's SSR build, which doesn't execute effects. Putting a `createEffect` inside `createAudioPlayer` reintroduces the SSR gap the engine already paid to avoid. A plain `reconcile()` export is:

- Synchronous, no framework semantics. Runs identically under SSR and in the browser.
- Explicit at the call site. The studio decides which mutations warrant a reschedule.
- Additive. The engine-internal scheduler body is already idempotent (stops active sources, prunes gain nodes, re-queues); exposing it as a method costs one property on the return type.

### Why not auto-reconcile on every store mutation the studio does

Mute toggles during playback should fire immediately. Gain-slider drags could rebuild 60×/sec if we treated each intermediate value as a reschedule; we don't — the UI commits on `change` (release), not `input` (drag), matching ADR 0008's "drag-in-progress is not the undo unit" pattern. The `createEffect` collapses multiple reads into one reschedule per frame via Solid's batching.

## AudioContext lifetime

**One context per project session, created lazily on the first play.** Browsers autoplay-gate `AudioContext` unless construction happens inside a user gesture; the play button click qualifies. `ensureContext()` creates it on demand and returns the same instance on subsequent calls. Import and decode can happen before first play — they use the same lazy context (we call `ensureContext()` at the top of `importFile`, inside the click handler that triggered the file picker, which is also a gesture).

Disposal: the context lives for the provider's lifetime. Project swap remounts the provider, which calls `context.close()` and lets the browser reclaim audio graph memory. Re-opening the same project mints a fresh context — cheap.

### Why one context, not one per import

A single context keeps the player's routing graph coherent and lets per-track `GainNode`s persist across imports (ADR 0009's mute-doesn't-click requirement). Creating throwaway contexts for decode-only work would also hit browser per-origin context limits faster than necessary.

## Fetch path for decode

Bytes come via `fetch(\`/@fs/\${absolutePath}/\${src}\`)`. Vite's `/@fs/` endpoint is already permitted for the projects directory — `scene.ts` loads through it today. `absolutePath` is on `ProjectListing` (already returned by `listProjects`); `AudioProvider` reads it from `useProject().available()` matched by `bundle().name`.

### Why not a new plugin endpoint that streams asset bytes

`/@fs/` already works, supports conditional requests, and is the same machinery the dev server uses for everything else. A dedicated endpoint would duplicate asset serving with no added authority (path-safety for writes already lives in the plugin; reads are bounded by Vite's `server.fs.allow`).

## Decode work-list helper

`AudioProvider`'s decode effect diffs the set of `src`s referenced by audio clips against the current `buffers` map. Extract that diff into a pure helper:

```ts
export const computeDecodeWorkList = (
  tracks: readonly Track[],
  decoded: ReadonlySet<string>,
  pending: ReadonlySet<string>,
): string[];
```

Pure, unit-testable, and keeps the provider effect body small. Returns the list of srcs that need decoding (referenced, not yet decoded, not currently in-flight).

## Import flow

```
user clicks "Import audio"
  → hidden <input type="file" accept="audio/*">
  → on change: importFile(file) {
      ensureContext()
      const { path } = await uploadAsset(projectName, file)        // assets/<basename>
      const bytes = await fetch('/@fs/' + absPath + '/' + path).then(r => r.arrayBuffer())
      const buffer = await decodeAudio(ctx, bytes)
      const peaks = computePeaks(buffer, DEFAULT_BUCKETS)
      registerBuffer(path, buffer, peaks)
      commands.push(addAudioTrackCommand(timeline, makeAudioTrack(path, buffer.duration)))
    }
```

On collision, `uploadAsset` overwrites (current plugin behavior; acceptable for v1). The re-fetch-after-upload round-trip exists so the buffer we decode matches the byte stream the player will see on a future project reload — not a theoretical worry today (we just wrote them), but it means the decode path is identical at import time and on project load.

## Non-goals (session 13)

- **Peak-cache to disk** (`projects/<name>/assets/.peaks/<hash>.bin`). ADR 0009 flagged it; deferred pending evidence of startup slowness. Compute in memory per session.
- **Inspector audio UI.** No editor for selected audio clip/track. Track mute + gain live inline on the timeline row.
- **Clip-level audio edits** (move/trim/per-clip gain/mute UI). Data model supports; UI later. Trim semantics for audio are non-trivial (`offset` shifts with left-trim) and deserve their own session.
- **Drag-and-drop import, multi-file batch.**
- **Voiceover recording** (session 14), **captions** (15), **TTS output as clip** (16), **export audio encoding** (17).

## Alternatives considered

- **Reactive subscription inside `createAudioPlayer`.** Rejected — reintroduces the SSR/test gap ADR 0009 paid to avoid.
- **Buffers keyed by `clip.id`.** Rejected — forces re-decode when the same asset is referenced twice.
- **Eager `AudioContext` construction at provider mount.** Rejected — autoplay policy forbids it without a user gesture; a suspended context is worse than a lazy one because it pretends to be ready.
- **New plugin endpoint for asset bytes.** Rejected — `/@fs/` already works and adding a second serving path splits authority.
- **One global audio context shared across all projects.** Rejected — project swap wants to free audio graph state; a shared context outlives the provider that owns it.
- **Commit gain-slider edits on `input` (continuous).** Rejected — 60 commands/sec into the undo stack, and the reconcile effect would schedule/cancel BufferSources that fast. Commit on `change` (release); the UI reflects the in-flight value locally, the store and reconcile see the final value.
- **Auto-create audio tracks by drag-drop.** Rejected — out of scope; keep import explicit for v1.

## Consequences

- New feature slice `apps/studio/src/features/audio/` with `AudioProvider.tsx`, `AudioPlayerHost.tsx`, `context.ts`, `computeDecodeWorkList.ts` (+ test), `index.ts`. A `features/audio/CLAUDE.md` lands alongside the code per `apps/studio/CLAUDE.md` feature convention.
- `AudioPlayer` return type widens to `{ dispose, reconcile }`. No change for existing callers of `dispose`.
- `features/timeline/store.ts` gains `appendAudioTrack`, `removeAudioTrackById`, `setAudioTrackGain`, `setAudioTrackMuted`. `commands.ts` gains `addAudioTrackCommand`, `removeAudioTrackCommand`, `setAudioTrackGainCommand`, `setAudioTrackMutedCommand`. `TimelineContextValue` widens.
- `features/timeline/TimelineView` dispatches rows through a `TrackRouter` to `NumberTrackRow` (renamed from `TrackRow`) or `AudioTrackRow`. New `AudioClipView` draws canvas waveforms from `Peaks` on zoom change and on peaks-arrived.
- Timeline header gains an "Import audio" button next to the collapse chevron.
- `App.tsx` mounts `<AudioProvider>` inside `<PlaybackProvider>` (needs playback + timeline + project contexts). `<AudioPlayerHost>` mounts inside `<AudioProvider>`.

## When to revisit

- **Peak-cache to disk.** If re-decoding long voiceovers on load stalls project boot.
- **Per-clip audio edits in the inspector.** When clip-level authoring becomes a common need.
- **Shared global context.** If a future design needs cross-project audio preview (unlikely in a single-project editor).
- **Two-context split (decode vs. playback).** Only if browsers add stricter autoplay rules and decode before play becomes gesture-gated too.
