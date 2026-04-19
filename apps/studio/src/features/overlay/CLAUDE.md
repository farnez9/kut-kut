# features/overlay

Persisted property overrides for scene nodes. Reads `projects/<name>/overlay.json` at project load, applies it between the scene factory and the timeline evaluator in `<PreviewHost>`, and writes back through the dev plugin on every mutation.

## Contract

- `<OverlayProvider name overlay>` mounts inside the `<Show keyed>` block in `App.tsx` next to `<TimelineProvider>`. Accepts the initial overlay from `useProject().bundle()?.overlay`.
- `useOverlay()` surface: `overlay` (Solid store), `getOverride`, `setOverride` (upsert), `removeOverride`, `saveState`, `saveError`.
- Overrides are keyed by `(nodePath, property)`. Upsert semantics: `setOverride` replaces an existing entry or pushes a new one; `removeOverride` is a no-op if absent.

## Persistence

`useOverlayPersistence` mirrors the timeline's pattern: 300 ms debounce, single-flight POST to `/__kk/projects/:name/overlay`, first run deferred. Disk state always mirrors memory.

## Apply order

`PreviewHost` runs `applyOverlay(scene, overlay)` in its own `createEffect`, separately from the timeline effect. Overlay runs first each render; the timeline runs after and wins inside an animated clip's window.

## Non-scope

- Node create / delete / reparent — schema-versioned for later.
- Non-numeric override values (strings, enums) — current schema v1 is `number | [number, number, number]`.
- Undo/redo integration — deferred; the timeline's command store does not know about overlay mutations today.
- Record mode that rewrites overlay edits as timeline keyframes when the playhead is inside a clip — session 10.
