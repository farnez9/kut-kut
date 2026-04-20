# Session 13 — Studio: audio panel

**Estimated:** ~2h focused
**Depends on:** Session 06 (Vite project-fs plugin + project loader), Session 08 (command store), Session 12 (engine audio core)
**Status:** done
**Links:** `plans/decisions/0009-audio-model.md`, `plans/decisions/0010-studio-audio-wiring.md` (this session), `packages/engine/CLAUDE.md`, `apps/studio/CLAUDE.md`, `apps/studio/src/features/timeline/CLAUDE.md`

## Goal

End state: the studio decodes a project's referenced audio assets on load, mounts a live `AudioPlayer` so play/pause/seek drive audio in sync with the timeline, renders audio tracks in the bottom timeline strip with min/max waveforms, lets the user import an audio file (file-picker Blob → Vite plugin → `assets/` → `AddAudioTrackCommand` pushes an `AudioTrack` onto the timeline), and exposes per-track mute + gain controls inline on the audio track row. Undo/redo covers track add/remove and mute/gain edits. No peak caching to disk this session — compute peaks in memory on decode.

## Design

ADR 0010 covers the wiring (buffers/peaks stores, lazy AudioContext, reconcile nudge, import flow). Summary here — rationale there.

### New engine surface (additive)

`AudioPlayer` returns `{ dispose, reconcile }`. `reconcile()` runs the internal scheduling body immediately. The studio calls it when `tracks` / `buffers` identity changes outside a playback transition (mute toggle while playing, gain slider drag, new track imported mid-playback). No behavior change in the player itself.

### New feature: `apps/studio/src/features/audio/`

- `AudioProvider` mounts **inside** `TimelineProvider` (needs timeline store) and **inside** `PlaybackProvider`. Exposes:
  - `buffers: Accessor<Map<string, AudioBuffer>>` — keyed by `clip.src` (project-relative).
  - `peaks: Accessor<Map<string, Peaks>>` — keyed the same way, computed once per buffer.
  - `importFile(file: File) => Promise<void>` — uploads via plugin, decodes + peaks, pushes `AddAudioTrackCommand`.
  - `decodeState: Accessor<Map<string, "pending" | "ready" | "error">>` — for surfacing per-clip load state.
- On mount + whenever `timeline.tracks` gains a new `AudioTrack` or an audio clip with a new `src`: fetch bytes from `fetch(\`/@fs/\${projectAbsolutePath}/\${src}\`)` (the plugin already allow-lists `projects/`), call `decodeAudio`, store the buffer + computed peaks. Skip srcs already decoded.
- The plugin's `readProject` response carries `absolutePath` already — `AudioProvider` reads it from the project context.

### `AudioPlayerHost`

Mounted once inside the `AudioProvider` subtree. Creates the `AudioContext` lazily on the first `playback.state()` transition to `"playing"` (some browsers require a user gesture; our play button click satisfies autoplay rules). Calls `createAudioPlayer({ context, tracks: () => timeline.tracks, buffers, playback })`. A `createEffect` reads `timeline.tracks.length`, each audio track's `gain` / `muted` / `clips.length`, and the `buffers()` size — on any change it calls `player.reconcile()`. Disposed on unmount.

### Timeline audio row

`TimelineView` currently filters to `NumberTrack`s (`numberTracks().filter(isNumberTrack)`). Change: render **all** tracks through a `TrackRouter` that dispatches to `NumberTrackRow` (current `TrackRow`, renamed) or `AudioTrackRow` (new). `AudioTrackRow`:

- Label: `"Audio · {track.id short}"` plus inline mute (button) + gain (small range input).
- Lane: `For` over `track.clips`, each `AudioClipView` renders a `<canvas>` sized to clip's pixel width/height, drawing the waveform min/max from peaks for the clip's `[offset, offset+duration]` slice. Redraw on zoom change or peaks-arrived.
- Selection: clicking a clip selects it (read-only in the inspector this session).

### Timeline commands for audio

Additive in `features/timeline/commands.ts` + `store.ts`:

- `addAudioTrackCommand(mutate, track: AudioTrack)` — apply pushes, invert removes by id.
- `removeAudioTrackCommand(mutate, track: AudioTrack)` — inverse of the above, captures the track for invert.
- `setAudioTrackGainCommand(mutate, trackId, prev, next)`.
- `setAudioTrackMutedCommand(mutate, trackId, prev, next)`.

Store additions: `appendAudioTrack(track)`, `removeAudioTrackById(id)`, `setAudioTrackGain(id, g)`, `setAudioTrackMuted(id, m)`. No clip-level edits (move/trim/gain) this session.

### Import flow

A small "Import audio" button lives in the timeline strip header (next to the collapse chevron). Clicking opens a hidden `<input type="file" accept="audio/*">`. On file select:

1. `uploadAsset(projectName, file)` → `assets/<basename>` on disk.
2. `await decodeAudio(ctx, bytes)` (a shared lazy context separate from playback's; reuse `AudioContext` if already created).
3. Compute `peaks = computePeaks(buffer, DEFAULT_BUCKETS)`.
4. Register into `buffers` + `peaks` stores.
5. Build an `AudioTrack` with a single clip spanning `[0, buffer.duration]`, `offset: 0`, `gain: 1`, `muted: false`, `src: "assets/<basename>"`.
6. `push(addAudioTrackCommand(...))`.

Name collisions: if `assets/<basename>` already exists on disk, the plugin overwrites (current behavior). Acceptable for v1.

### Reactive nudge — why external, not in the engine

ADR 0009 deliberately kept the player driven only by `onTransition`. Studio-side mutations (gain slider, mute, new track, new buffer) aren't transitions. The cleanest seam is a `reconcile()` export plus a studio-side `createEffect`. Adding reactive subscription inside the engine would drag Solid's `createEffect` into the player and re-open the SSR issue session 12 walked into. See ADR 0010.

### Non-trivial UI bits

- Waveform canvas: draw `min`/`max` per bucket; we pick buckets equal to clip pixel width. Re-render on zoom change.
- Gain slider: `0..1.5` linear; snap to `1.0` at center. Keep it tiny — a 60px range input in the label area. Edits commit a command on `change` (release), not `input` (drag).

## Tasks

Ordered. Each task ≈ 15–45 min.

1. [ ] **ADR 0010 — studio audio wiring.** Covers: buffers/peaks stores and their keying, lazy AudioContext + autoplay gesture requirement, `AudioPlayer.reconcile()` as the studio-side reactivity seam (and why not in-engine), import flow (plugin → decode → command), non-goals (peak-cache-to-disk, per-clip edits, inspector audio UI, voiceover). `plans/decisions/0010-studio-audio-wiring.md`. ~15 min.
2. [ ] **Engine: expose `AudioPlayer.reconcile()`.** Trivial additive change in `packages/engine/src/audio/player.ts` — return `{ dispose, reconcile }`. Update `AudioPlayer` type. Test: calling `reconcile()` after mutating a track's `muted` field without a transition rebuilds the schedule. Export stays unchanged (the factory result type widens). ~15 min.
3. [ ] **`features/audio/` slice — buffers + peaks + import.** New folder: `AudioProvider.tsx`, `context.ts`, `index.ts`. Effects: on mount and on `timeline.tracks` change, enumerate audio-clip srcs, fetch missing bytes via `/@fs/` using project's `absolutePath`, `decodeAudio`, `computePeaks(buffer, DEFAULT_BUCKETS)`, stash. `importFile(file)` wraps upload + decode + peaks + `AddAudioTrackCommand`. Tests: unit-test a thin helper that diffs current buffers vs. timeline-referenced srcs and yields a decode work list. ~35 min.
4. [ ] **Timeline store + commands for audio tracks.** `store.ts`: `appendAudioTrack`, `removeAudioTrackById`, `setAudioTrackGain`, `setAudioTrackMuted`. `commands.ts`: `addAudioTrackCommand`, `removeAudioTrackCommand`, `setAudioTrackGainCommand`, `setAudioTrackMutedCommand`. Extend `TimelineContextValue` with these mutators. Tests: apply/invert for each command round-trips to identity on the timeline. ~25 min.
5. [ ] **`AudioPlayerHost` mount + reconcile effect.** Lives inside `AudioProvider`. Lazy `AudioContext` on first `state() === "playing"`. `createEffect` reads `timeline.tracks.length`, each audio track's `gain`/`muted`/`clips.length`, and `buffers().size`; on change calls `player.reconcile()`. Mount in `App.tsx` alongside `TimelineProvider` (inside it, because it depends on the timeline store). ~20 min.
6. [ ] **Timeline audio row rendering.** Rename `TrackRow` → `NumberTrackRow`. New `TrackRouter` dispatch in `TimelineView` that renders both kinds (drop the `numberTracks` filter). New `AudioTrackRow` + `AudioClipView` (canvas-based waveform from peaks). Inline mute button + gain range input on the audio row label. Edits dispatch the commands from task 4. ~30 min.
7. [ ] **Import button + wire-up.** "Import audio" button in the timeline header (next to the collapse chevron). Hidden `<input type="file" accept="audio/*">`; on change calls `audio.importFile(file)`. Surface errors in the existing save-banner style or a transient toast. ~20 min.
8. [ ] **Verification sweep.** `bun test`, `bun run typecheck`, `bun run lint`. Manual: boot `bun run dev`, import a short mp3 into an existing project, verify waveform renders at multiple zooms, play → audible, pause → silence, seek → audio restarts at new time, mute/unmute track while playing, undo import → track gone + audio stops, redo → track back. `assets/<file>` appears on disk; `timeline.json` gains the new `AudioTrack`. Fill Outcome. ~10 min.

## Non-goals

- **Peak cache to `projects/<name>/assets/.peaks/<hash>.bin`.** ADR 0009 flagged it for session 13, but scope is tight; compute in memory each load. Revisit if startup with large audio is slow (follow-up).
- **Inspector audio UI.** Selecting an audio clip or track shows no editor this session. Track-level mute + gain are inline on the row; that's it.
- **Clip move / trim for audio clips.** Reuse of the existing drag code for audio clips is plausible but out of scope — needs `setAudioClipStart` / `setAudioClipEnd` / `setAudioClipOffset` and bespoke trim semantics (`offset` moves with left-trim, analogous to keyframe shifting). Session 14+.
- **Per-clip gain / mute UI.** The data model supports it (ADR 0009); no editor yet.
- **Voiceover recording.** Session 14.
- **Captions.** Session 15.
- **TTS output as an audio clip.** Session 16.
- **Export-time audio encoding.** Session 17.
- **Multi-file batch import.** One file at a time.
- **Drag-and-drop import.** File picker only.
- **Format detection beyond what the browser `decodeAudioData` accepts.** If decode throws, surface the error verbatim.
- **External-edit watch** on `timeline.json` / `assets/`. Same caveat as session 07.

## Verification

- `bun test` green, including new tests in `packages/engine/src/audio/player.test.ts` (reconcile), `apps/studio/src/features/timeline/commands.test.ts` (audio commands), `apps/studio/src/features/audio/*.test.ts` (decode work-list helper).
- `bun run typecheck`, `bun run lint` green.
- `plans/decisions/0010-studio-audio-wiring.md` exists and is linked from this spec.
- Manual golden path (listed in task 8): import → waveform → play → mute → undo.
- Audio lag/drift over a 10 s playback is within a couple of frames of the scene timeline (visual + audible check — no automated measurement yet).
