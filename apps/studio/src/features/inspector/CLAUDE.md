# features/inspector

Right-hand property panel bound to the timeline's selection. Read-only in session 08 — editing lands in session 09 together with the scene overlay state file.

## Contract

- `<Inspector>` reads `useTimeline().view.selection`. If a keyframe is selected it renders the keyframe summary; otherwise it falls back to the clip summary; otherwise an empty-state prompt. Mount inside a `<TimelineProvider>`.
- `<InspectorHint>` renders the ⌘Z / ⌘⇧Z hint shown in the panel head.

## Non-scope

- Property editing (session 09). Requires the overlay state file for scene-structure mutations.
- Node hierarchy view, multi-select, grouped inspectors — later.
- Editing clip start/end/duration via number inputs — session 09.
