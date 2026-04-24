# features/overlay

Persisted property overrides + structural ops for scene nodes. Reads `projects/<name>/overlay.json` at project load, applies it between the scene factory and the timeline evaluator in `<PreviewHost>`, and writes back through the dev plugin on every mutation.

Overlay v2 (ADR 0007) adds `additions[]` and `deletions[]` alongside the existing `overrides[]`. The overlay is now the single GUI-driven-scene-state surface: property overrides **and** structural node ops (create / delete).

## Contract

- `<OverlayProvider name overlay factory>` mounts inside the `<Show keyed>` block in `App.tsx` next to `<TimelineProvider>`. Accepts the initial overlay from `useProject().bundle()?.overlay` and the scene **factory** (`() => Scene`) from `bundle.factory`.
- `useOverlay()` surface:
  - `overlay` — Solid store over the full v2 document.
  - `scene` — `Accessor<Scene>` that re-runs the factory + `applyNodeOps` on every structural change. Consumers that need "what the preview is rendering" (Inspector `findNodeByPath`, `KeyedPreviewHost`) read this. The authored tree remains available on `useProject().bundle()?.scene` (unmutated), which LayersPanel uses so deleted rows stay visible and strike-through.
  - `getOverride`, `setOverride` (upsert), `removeOverride` — property override CRUD; keyed by `(nodePath, property)`.
  - `addNode({ parentPath, name, kind })` — append-only structural addition. De-duped on `(parentPath, name)`.
  - `deleteNode(path)` — pushes a deletion entry. De-duped on `path`.
  - `restoreNode(path)` — removes the matching deletion entry.
  - `isDeleted(path)` — true iff a deletion entry currently targets `path`.
  - `structureKey` — `Accessor<string>` stringifying `additions` + `deletions`; changes only when structure mutates.
  - `saveState`, `saveError` — persistence health.

## Persistence

`useOverlayPersistence` mirrors the timeline's pattern: 300 ms debounce, single-flight POST to `/__kk/projects/:name/overlay`, first run deferred. Disk state always mirrors memory.

## Apply order

Per structural change (inside `OverlayProvider`'s `scene` memo):

1. Re-run the scene factory to produce a pristine `Scene`.
2. `applyNodeOps(scene, overlay)` — additions first, then deletions. Deletion wins over addition at the same path (so deleting an overlay-added row removes it from the preview). Mutates the fresh scene only.

Per-frame (`createEffect` in `PreviewHost` driven by `playback.time()`):

3. `applyOverlay(scene, overlay)` — property overrides.
4. `applyTimeline(scene, timeline, t)` — animated tracks.

Because the scene is rebuilt from the factory on every structural change, restore-from-deletion is fully reversible — the deleted node comes back on the next factory run. `KeyedPreviewHost` wraps `PreviewHost` in `<Show when={scene()} keyed>`, so the compositor is disposed + remounted cleanly on every structural change (Pixi/Three layer renderers build their tree once per mount).

## Non-scope

- Node rename / reparent / reorder — deferred (rename needs a rewrite pass over overrides, additions, timeline tracks).
- Layer-level additions — kind enum is `rect | box | group`; layers come from `scene.ts`.
- Per-index array-element overrides — the override schema now accepts `number | string | Vec3 | Vec3[]`, but multi-segment paths like `points.0.x` are not resolved; `points` is stored as a whole array in one override.
- Undo/redo integration — session 11 via a generalized command store spanning timeline + overlay.
- Record mode that rewrites overlay edits as timeline keyframes — session 11.
- Overlay-side tidy-up of orphaned overrides under a deleted subtree — polish session.
