# features/timeline

Interactive editor for the bottom timeline strip. Owns mutable state for the current project's `Timeline` plus the UI view state (zoom, origin, selection).

## Contract

- `<TimelineProvider name duration timeline>` mounts inside `<PlaybackProvider>`, converts the incoming `Timeline` into a Solid `createStore`, and publishes `{ timeline, view, setView, moveClip, selectClip, saveState, saveError, name, duration }` via `TimelineContext`.
- `<ProjectProvider>` stays plain. Assembly (discovery, dynamic import, JSON parse) lives there; live editing lives here. On project swap the whole subtree remounts, so the old store disposes naturally.
- `<PreviewHost>` reads `useTimeline().timeline` (Solid store proxy) and passes it into `applyTimeline` — every store mutation propagates to the preview without re-mounting.
- All reads from the timeline go through `useTimeline()`. Do not pass the bundle's plain `Timeline` around as a prop.

## Mutations

Session 07 ships one mutation: `moveClip(trackId, clipId, newStart)` — preserves clip duration. Trim edges, keyframe time drag, create/delete land in session 08 as additions on the same store.

## View state

`view.zoom` is px per second. `view.origin` is the second shown at the strip's left edge. `view.selection` is a single `clipId | null`. Mutate via `setView(key, value)`; `selectClip(id)` is the convenience wrapper.

## Persistence

`useTimelinePersistence(name, timeline)` (mounted inside the provider) watches `serializeTimeline(timeline)`, debounces 300 ms, and calls `writeTimeline(name, json)` with single-flight semantics. First run is deferred — loading the file must not immediately rewrite it. Errors surface through `saveError()`.

## Non-scope

- Creating / deleting tracks, clips, or keyframes — session 08.
- Dragging keyframes — same drag helper + a new mutation — session 08.
- Snap, undo/redo, multi-select — session 08.
- Watching `timeline.json` for external edits. Not implemented: hand-edits while the studio is running get clobbered by the next debounced save. Dev-only caveat; revisit if it bites.
- Audio waveforms / caption tracks — sessions 10–12 bring their own row renderers.

## Pointer drags

Every drag goes through `interaction.ts#startPointerDrag`. Native HTML5 `draggable="true"` is banned: ghost-image flicker, no modifier keys, no touch parity.
