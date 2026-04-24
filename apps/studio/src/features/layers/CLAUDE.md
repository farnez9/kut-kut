# features/layers

Left-sidebar tree of the current project's scene. Renders author-defined nodes from `useProject().bundle()?.scene` **plus** overlay additions, marks overlay deletions as struck-through, and offers per-row affordances for add / delete / restore.

## Contract

- `<LayersPanel>` mounts inside `<OverlayProvider>` and `<TimelineProvider>`. No props.
- Reads from `useProject()` + `useOverlay()`; writes via `overlay.addNode` / `overlay.deleteNode` / `overlay.restoreNode`. Selection writes go to `timeline.selectNode(path)` — same surface the inspector listens on.
- `deriveLayerTree(scene, overlay)` produces the virtual tree the panel renders. Pure — no reactive reads. Returns `LayerTreeNode[]` per root layer. Authoritative for "what to render" and "what's deleted"; the actual compositor state is computed by `applyNodeOps` at mount time.
- `pickUniqueName(siblings, base)` picks `base` if free, else `${base} 2`, `${base} 3`, … filling gaps.

## Apply surfaces

- Add → `overlay.addNode({ parentPath, name, kind })` → overlay `additions[]` grows → `structureKey` changes → `<PreviewHost>` remounts (see `features/preview/CLAUDE.md` and `features/overlay/CLAUDE.md`).
- Delete → `overlay.deleteNode(path)` → `deletions[]` grows → remount.
- Restore → `overlay.restoreNode(path)` → `deletions[]` shrinks → remount. A restored node re-appears in the scene only if `scene.ts` still defines it (factory-owned) — within-session restore of user-added nodes not reversible without project reload (session-11 undo).

## Non-scope

- Keyboard navigation, multi-select, drag-reorder, drag-reparent — deferred.
- Rename — deferred (needs a path-rewrite pass across overrides, additions, and timeline tracks).
- Layer-level additions (new 2D / 3D layer) — kind enum is `rect | box | group | text | circle | line`; layers come from `scene.ts`.
- "Has override" or "added-by-user" per-row badges — polish.
- Destructive-delete confirmation — overlay-reversible, skipped.
