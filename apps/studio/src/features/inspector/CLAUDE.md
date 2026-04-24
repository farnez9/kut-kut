# features/inspector

Right-hand property panel bound to the timeline's selection. Renders a read-only summary for clips and keyframes, and **editable** transform fields for scene nodes (writes go through the overlay feature).

## Contract

- `<Inspector>` reads `useTimeline().view.selection`. Panel precedence: **keyframe > node > clip > empty**. `nodePath` is derived from the selected clip's track target on `selectClip` / `selectKeyframe`; a keyframe edit does not flip the panel to the node panel.
- `<InspectorHint>` renders the ⌘Z / ⌘⇧Z hint shown in the panel head.
- Mount inside a `<TimelineProvider>` **and** an `<OverlayProvider>`. The node panel reads the scene from `useProject().bundle()?.scene` and writes via `useOverlay().setOverride` / `getOverride`.

## Node panel

- 2D nodes (Rect, Layer2D, or Group with a 2D transform): six `NumberInput`s for `transform.{x,y,rotation,scaleX,scaleY,opacity}`.
- 3D nodes (Layer3D, Box, or Group with a 3D transform): three `Vec3Input`s for `transform.{position,rotation,scale}` plus a `NumberInput` for `transform.opacity`.
- Primitive-specific fields (rendered below the transform block when applicable):
  - **Text** — `TextInput` for `text`, `fontFamily`, `align`; `NumberInput` for `fontSize`; RGB `Vec3Input` for `color`.
  - **Circle** — `NumberInput` for `radius` and `strokeWidth`; RGB `Vec3Input` for `color`.
  - **Line** — two `Vec3Input` rows (`start` / `end`) that commit the whole `points` array in one override (multi-segment paths like `points.0.x` are not resolved). RGB `color`, `width`. N-point polylines are authored in `scene.ts`.
- Each input shows the **effective** value — the overlay override if present, else the scene factory's base value. Commits write through `setOverride`. There is no "clear override" control yet; typing the same value as the factory still persists an override. Flagged as Follow-up.

## Input primitives

`editors/NumberInput` and `editors/Vec3Input`. `NumberInput` uses a local draft signal and commits on blur / Enter / (non-input events), so typing partial numbers like `-0.` doesn't snap. Escape reverts. `Vec3Input` is three `NumberInput`s with axis labels.

## Non-scope

- Non-transform property editors (color, material, per-node custom props) — next session.
- Multi-select, grouped inspectors, node hierarchy tree — later.
- Editing clip start/end/duration via number inputs — deferred (timeline handles drags).
- "Has override" badge / clear-override button — polish.
