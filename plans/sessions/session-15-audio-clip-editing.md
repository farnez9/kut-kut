# Session 15 — audio-clip-editing

**Estimated:** ~2h focused
**Depends on:** sessions 08 (command store + number-clip drag/trim), 12 (audio core), 13 (studio audio panel), 14 (voiceover recording)
**Status:** done
**Links:**
- `apps/studio/src/features/timeline/CLAUDE.md`
- `apps/studio/src/features/audio/CLAUDE.md`
- `plans/decisions/0008-record-mode-and-unified-undo.md`
- `plans/decisions/0009-audio-model.md`

## Goal

Audio clips become draggable and trimmable on the timeline, matching the interaction model already built for number-track clips. Dragging the body shifts `start` and `end` together. Dragging the left handle shifts `start` and compensates `offset` so the waveform scrolls under the clip (non-slip semantics — the audible sample at a given timeline position stays fixed across a left-trim). Dragging the right handle moves `end` only. Every drag ends with a single undoable command through the unified command store; `⌘Z` / `⌘⇧Z` replay cleanly. The waveform draw reflects the new `[offset, offset + duration]` window.

## Design

Mirror the number-track setup. Three new raw setters on `TimelineContext`, three new commands, pointer handlers on `AudioClipView`. `startPointerDrag` is reused verbatim; no new interaction primitive.

**New `TimelineContext` setters** (raw, no history — like the number-track ones):

```ts
moveAudioClip(trackId, clipId, newStart): void         // preserves (end - start) and offset
resizeAudioClipLeft(trackId, clipId, newStart): void   // shifts start + offset by the same delta
resizeAudioClipRight(trackId, clipId, newEnd): void    // moves end only
```

**Clamps (at the call site, not inside setters — same convention as number-track):**

- `MIN_CLIP_SEC` minimum duration (shared constant).
- `start ≥ 0`, `end ≤ sceneDuration`.
- Trim-left: `offset ≥ 0`.
- Trim-right: `offset + (end − start) ≤ buffer.duration`. Read duration from `audio.buffers().get(clip.src)?.duration`; if the buffer isn't decoded yet, skip the right-edge rail (no safety during a just-imported clip — rare, harmless).

**Commands** (mirror `resizeClipLeftCommand` et al. in `commands.ts`): setter-style, idempotent, `pre/post` snapshots of `{start, end, offset}`. Build on `pointerup`, `push()` into the unified store. Re-applying after the drag is a no-op (same safety as number-clip commands).

**Waveform under trim.** `AudioClipView` draws peaks across the full clip width today assuming `offset = 0`. Change the peaks-to-canvas mapping to read the `[offset, offset + (end − start)]` slice of the full-buffer peaks so trim-left scrolls and trim-right crops the tail. Fall back to the current behaviour if peaks are missing.

**No engine change.** Audio clip mutation stays studio-side (matches how number-clip mutation lives in the timeline feature). `createAudioPlayer.reconcile()` already re-reads `start` / `end` / `offset` on the next transition, so a drop immediately reflects in playback.

## Tasks

1. [x] Add `moveAudioClip`, `resizeAudioClipLeft`, `resizeAudioClipRight` to `TimelineContextValue` and implement in `TimelineProvider`. Unit-level — no UI yet. (≈15 min)
2. [x] `commands.ts` — add `moveAudioClipCommand`, `resizeAudioClipLeftCommand`, `resizeAudioClipRightCommand`. Tests round-trip apply + inverse, including `offset` preservation on move and `offset` shift on trim-left. (≈25 min)
3. [x] `AudioClipView` in `AudioTrackRow.tsx`: replace the single `onPointerDown` with body + left-handle + right-handle drag handlers using `startPointerDrag`. Compute deltas, call raw setters during drag, build + `push()` a command on `pointerup`. Mirror `Clip.tsx` structure. (≈35 min)
4. [x] Waveform peaks slicing in `AudioClipView`: map the canvas x-range to `[offset, offset + (end − start)]` of the full-clip peaks; keep existing fallback when peaks aren't ready. (≈20 min — already present from session 13; verified.)
5. [x] Docs: `features/timeline/CLAUDE.md` — list the three new setters under Mutations; `features/audio/CLAUDE.md` — remove "Clip move / trim for audio clips" from Non-scope and add a short "Trim semantics" note covering offset-compensating trim-left. (≈10 min)
6. [x] `test-runner` for `bun test` / `bun run typecheck` / `bun run lint`; `code-reviewer` on the pending diff. (≈15 min)

## Non-goals

- **No value-axis drag** for audio (there is none — gain lives on the track row).
- **No snapping** (to playhead, neighbours, grid) — deferred to the snap-manager session.
- **No multi-select, marquee, keyboard nudge, copy/paste** — same deferral as number clips.
- **No clip splitting / razor tool.** Revisit if a real project needs it.
- **No cross-track drop.** Horizontal drag only, within the clip's own track.
- **No engine-level audio-clip mutation helpers.** Mutations stay studio-side.
- **No `AudioPlayer` changes.** Drag-in-progress isn't reflected in live playback until `pointerup` (same behaviour as number-track drag).
- **No ADR this session.** Direct extension of ADR 0008.

## Verification

Via `test-runner`:

- `bun test` — new command round-trip tests pass.
- `bun run typecheck` — widened `TimelineContextValue` clean.
- `bun run lint` — Biome clean.

Manual (Chromium):

- Import an audio clip; drag the body → start + end shift together, waveform slides with the clip. ⌘Z restores; ⌘⇧Z re-applies.
- Trim the left handle → waveform scrolls right (later samples appear at the clip's left edge), and the audible sample at any fixed timeline position stays the same.
- Trim the right handle → tail crops; nothing else changes.
- Drag past `MIN_CLIP_SEC` → handle resists.
- Trim-left past buffer start → resists at `offset = 0`.
- Trim-right past buffer end → resists at `offset + duration = buffer.duration`.
- Record a voiceover, then drag + trim it — identical to imported.
- Playback: no stutter during drag; after drop, playback audibly matches the new window.
