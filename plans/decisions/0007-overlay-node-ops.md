# 0007 — Overlay node ops: schema v2 with additions and deletions

**Date:** 2026-04-19
**Status:** accepted
**Context:** session 10 (scene node create / delete). Extends ADR 0006 to cover structural scene mutations driven by the GUI. Replaces the "future overlay version" placeholder left open when v1 shipped.

## Decision

Overlay schema bumps to **v2**. Two sibling arrays join the existing `overrides` field:

```ts
// packages/engine/src/overlay/schema.ts
export const CURRENT_OVERLAY_VERSION = 2 as const;

type NodeKind = "rect" | "box" | "group";      // closed union for v2

type NodeAddition = {
  parentPath: string[];                         // non-empty; targets a Group / Layer2D / Layer3D
  name: string;                                 // unique among siblings at apply time
  kind: NodeKind;
};

type NodeDeletion = {
  path: string[];                               // non-empty; any node
};

type OverlayJSON = {
  schemaVersion: 2;
  overrides: PropertyOverride[];
  additions: NodeAddition[];
  deletions: NodeDeletion[];
};
```

`emptyOverlay()` returns `{ schemaVersion: 2, overrides: [], additions: [], deletions: [] }`.

## Apply order

```
factory()                           # fresh scene from scene.ts (every structural change)
  → applyNodeOps(scene, overlay)    # additions first, then deletions (NEW in v2)
  → applyOverlay(scene, overlay)    # per-frame property overrides (ADR 0006)
  → applyTimeline(scene, timeline, t) # per-frame animation
```

`applyNodeOps` resolves **additions first, then deletions** so a deletion at a path always wins over an addition at the same path. This matters because the Layers-panel "delete" affordance on an overlay-added row produces exactly that overlap (`additions=[X]`, `deletions=[X]`): the user's intent is "remove X from the rendered scene", and deleting-last honours that. The inverse order was tried first and broke the "delete an added node" UX in session 10 verification. Additions append to `parentPath.children[]`; there is no anchored insertion.

`applyNodeOps` is **idempotent and in-place**. Re-running against the same `(scene, overlay)` pair is a no-op because `addOne` de-dupes on sibling name and `deleteOne` is a no-op when its path no longer resolves. In practice the scene is rebuilt from the factory on every structural change (see `features/overlay/CLAUDE.md`), so idempotence is defence-in-depth rather than load-bearing.

## Kind rules

`applyNodeOps` enforces kind × parent compatibility; the Layers-panel UI makes invalid paths unreachable:

| kind    | valid parents                            | transform kind  |
|---------|------------------------------------------|-----------------|
| `rect`  | Layer2D or a Group with `Transform2D`    | 2D              |
| `box`   | Layer3D or a Group with `Transform3D`    | 3D              |
| `group` | any of the above; inherits parent's kind | 2D or 3D        |

Mismatched additions are silently skipped — defence-in-depth; the UI prevents the path from being taken.

## Deletion semantics

- **Deletion removes the node from the rendered scene**, not from `scene.ts`. Editing `scene.ts` happily re-adds the node; the overlay deletion sticks because its `path` still resolves.
- **Deletions cascade.** Removing a Group removes its subtree in one step; the engine does not walk overrides / additions under the subtree to clean them up. Orphans silently fail to resolve; a tidy-up pass is a polish session.
- **Unresolvable deletions are silent no-ops.** If the author already removed the node from source, the overlay entry is harmless dead weight.

## Addition naming

The Layers panel picks a unique sibling name at add time (e.g. `Rect 2` if `Rect` already exists). If two additions collide at apply time — author renamed a sibling to match, or another client wrote the same overlay concurrently — the later one is silently skipped. In practice the UI prevents this; the engine-side rule exists so a hand-edited `overlay.json` can't crash apply.

## Migration v1 → v2

`parseOverlay` runs `migrateOverlay(raw)` before `safeParse`:

- `schemaVersion === 2` → passthrough.
- `schemaVersion === 1` → add `additions: []` and `deletions: []`, bump `schemaVersion` to 2.
- Any other version → throw `overlay schemaVersion X not supported (current: 2)`.

No reverse migration. v1 documents on disk upgrade lazily on the next overlay write.

## Rationale

### Why one schema, not a sibling `structure.json`

`overlay.json` is already the single "GUI edits to the scene" surface per ADR 0006, with an established debounce / validation / on-disk format. Splitting structural ops into a second file would double the plugin endpoints and the save-effect surface without any payoff — the lifetimes are identical (touched only when the user edits a scene node). Keep one file. The name `overlay` now covers "all GUI-driven scene state" rather than "property overrides"; the original intent generalizes cleanly.

### Why current-state arrays, not a patch log

Same reasoning as ADR 0006's property overrides. Additions and deletions are idempotent snapshots; apply order is stable; the file is hand-editable and diffs cleanly in git. A patch / event log would duplicate the undo story the command store already owns in memory and force compaction over time.

### Why append-only additions

Anchored insertion ("between child A and child B") requires sibling identity that survives the author renaming or deleting A or B from `scene.ts`. We address nodes by `name` (per ADR 0005), and siblings' names are explicit render order. Forcing additions to the end keeps the schema simple; users who care about render order can either delete the author-defined sibling and re-add it, or update `scene.ts`. Drag-reorder is a bigger UX feature and gets its own session when it lands.

### Why `kind` is a closed union, not a free string

Reading a string back from disk and attempting to look up an arbitrary factory is exactly the "GUI writes inputs the engine can't safely interpret" trap ADR 0002 avoids on the timeline side. A closed union means every valid overlay parses to a kind the engine has a factory for. New kinds bump the enum explicitly.

### Why no root-level additions

Layers carry their own type distinction (Scene2DLayer vs Scene3DLayer) and kicked up enough UX questions (where does the viewport sit? which renderer adapter owns it? does the timeline grow a new track?) that cramming them into v2 would dilute the core. Layer creation is a future feature; v2 ships "add children under an existing Group / Layer" only.

### Why deletions don't cascade-clean the overlay

Cleaning up orphan overrides / additions under a deleted subtree has two correctness traps: (a) if the user *un*-deletes the node later, their pre-delete overrides would be lost; (b) path-prefix matching across `overrides[]` and `additions[]` is correct but non-trivial and easy to get wrong during a live session. Leaving orphans in place is cheaper, reversible, and consistent with the "unresolved paths are silent skips" posture we already have. A polish pass can add a user-triggered "compact overlay" action later.

## Consequences

- Engine public surface gains `applyNodeOps` and the new types `NodeAddition`, `NodeDeletion`, `NodeKind`.
- `parseOverlay` grows a migration step; callers see only the migrated v2 shape.
- Plugin read/write endpoints are unchanged — they already pipe through `parseOverlay`.
- `PreviewHost` grows a second `createEffect` dedicated to structural reconciliation, created before the existing per-frame effect so the first structural pass lands before the first apply.
- Studio overlay store gains `addNode`, `deleteNode`, `restoreNode`, `isDeleted`.
- **Scene lifetime is structurally monotonic within a single mount.** Additions/deletions only grow as the user clicks. Anything that needs to *shrink* them (session 11 undo) must reset the scene first — flagged as session-11 plumbing.

## Alternatives considered

- **Second file (`structure.json`).** Rejected — identical lifetime, doubled plumbing, no upside.
- **Patch / event log.** Rejected — same reasoning as ADR 0006.
- **Scene-factory replay via ProjectProvider exposing `buildScene()`.** Rejected — forces ProjectProvider to cache the async `scene.ts` import and replay it on overlay change, complicating the HMR remount story. Idempotent in-place `applyNodeOps` avoids the coupling.
- **Free-form `kind: string`.** Rejected — schema totality matters; new kinds bump the enum.
- **Anchored-insertion additions (`{ before: name } | { after: name }`).** Rejected for v2 — sibling identity across `scene.ts` edits is fragile. Revisit with drag-reorder.
- **Layer-level additions in v2.** Rejected — layer kind + renderer adapter + timeline-impact surface is its own feature.

## When to revisit

- **Session 11** adds keyframe record mode and a generalized command store; at that point node ops plug into a unified undo stack, and the "shrink additions" case becomes real — scene reset on overlay-shrink lands there.
- **Rename** forces `nodePath` rewrites across `overrides[]`, `additions[]` (for descendants), and `timeline.json` tracks. Its own ADR when it lands.
- **Reparent / reorder** needs a drag UX plus the scene-invalidation story above.
- **Layer-level additions.** Revisit when the roadmap grows a compelling scene-surface case.
- **Overlay compaction** (strip orphaned overrides / additions after a delete) — polish session.
- **Concurrent editing** would stress "silent skip on collision" — not on the roadmap.
