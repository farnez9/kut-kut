# features/timeline

Interactive editor for the bottom timeline strip. Owns mutable state for the current project's `Timeline` plus the UI view state (zoom, origin, selection).

## Contract

- `<TimelineProvider name duration timeline>` mounts inside `<PlaybackProvider>`, converts the incoming `Timeline` into a Solid `createStore`, and publishes the live mutation API, selection, history, and persistence state via `TimelineContext`. See `context.ts` for the full shape.
- `<ProjectProvider>` stays plain. Assembly (discovery, dynamic import, JSON parse) lives there; live editing lives here. On project swap the whole subtree remounts, so the store and undo history dispose naturally.
- `<PreviewHost>` reads `useTimeline().timeline` (Solid store proxy) and passes it into `applyTimeline` — every store mutation propagates to the preview without re-mounting.
- All reads from the timeline go through `useTimeline()`. Do not pass the bundle's plain `Timeline` around as a prop.

## Mutations

Raw setters, no history:

- `moveClip(trackId, clipId, newStart)` — preserves duration.
- `resizeClipLeft(trackId, clipId, newStart)` — mutates start only. Clamp to `[0, clip.end - MIN_CLIP_SEC]` at the call site.
- `resizeClipRight(trackId, clipId, newEnd)` — mutates end only. Clamp to `[clip.start + MIN_CLIP_SEC, sceneDuration]` at the call site.
- `setKeyframeTime(trackId, clipId, index, newTime)` — sets a single keyframe's clip-local time. Does NOT sort.
- `sortClipKeyframes(trackId, clipId)` — explicit sort after a keyframe drag.

Trim semantics match Premiere's non-slip behaviour: keyframes store clip-local times and are preserved across trim; ones that fall outside `[0, clip.end - clip.start]` are clamped at the edges by `evaluateClip`, not deleted.

## History

Drag-in-progress is NOT the undo unit. Drag handlers call raw setters during `pointermove`, then on `pointerup` build a command (see `commands.ts`) and call `push(cmd)`. Commands are setter-style and idempotent: re-applying to already-at-post state is a no-op, so `push` re-applying after the drag is safe.

- `push(cmd)` — applies + records, clears future.
- `undo()` / `redo()` — moves commands between past/future stacks (capped at 200).
- `canUndo()` / `canRedo()` — accessors for UI.
- History resets on project swap. HMR of `scene.ts` also remounts the provider; history is lost. Acceptable — scene edits are author intent, not undoable studio actions.

Keyboard: `useUndoHotkeys` (private to this feature) registers `cmd/ctrl+Z` and `cmd/ctrl+shift+Z` / `cmd/ctrl+Y` on `window` and ignores events whose target is an `<input>`, `<textarea>`, or `contenteditable` element, so native field-level undo keeps working.

## View state

`view.zoom` is px per second. `view.origin` is the second shown at the strip's left edge. `view.selection` is `{ clipId: string | null; keyframeId: string | null }`. `keyframeId` format is `${clipId}:${index}` — use `makeKeyframeId` / `parseKeyframeId`. Selecting a keyframe also implies its owning clip is selected. Mutate via `setView(key, value)`; `selectClip(id)` / `selectKeyframe(clipId, index)` / `clearSelection()` are the convenience wrappers.

## Persistence

`useTimelinePersistence(name, timeline)` (mounted inside the provider) watches `serializeTimeline(timeline)`, debounces 300 ms, and calls `writeTimeline(name, json)` with single-flight semantics. First run is deferred — loading the file must not immediately rewrite it. Errors surface through `saveError()`. Commands, undo, and redo all flow through the same effect — there is no "skip save on undo" mode; disk always mirrors memory.

## Non-scope

- Creating / deleting tracks, clips, or keyframes — session 09 (needs the scene overlay state file).
- Keyframe value-axis drag and easing changes — session 09 via the inspector.
- Snap (to playhead, grid, neighbour keyframes) — deferred to a dedicated snap-manager session so audio/captions can register targets.
- Multi-select, marquee select, keyboard clip nudge, copy/paste — deferred post-session 09.
- Watching `timeline.json` for external edits. Not implemented: hand-edits while the studio is running get clobbered by the next debounced save. Dev-only caveat; revisit if it bites.
- Audio waveforms / caption tracks — later sessions bring their own row renderers.

## Pointer drags

Every drag goes through `interaction.ts#startPointerDrag`. Native HTML5 `draggable="true"` is banned: ghost-image flicker, no modifier keys, no touch parity.
