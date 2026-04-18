# 0005 — Track targets: `nodePath` in addition to `nodeId`

**Date:** 2026-04-19
**Status:** accepted
**Context:** session 06 (project loader). Closes the "how does `timeline.json` reference scene nodes?" question surfaced while planning the project-fs plugin.

## Decision

Widen `TrackTarget` to a union:

```ts
type TrackTarget =
  | { nodeId: string; property: string }
  | { nodePath: string[]; property: string }
```

`applyTimeline` resolves the target by checking `"nodePath" in target` first; otherwise falls back to `findNodeById`. The valibot schema becomes a `union([TrackTargetByPathSchema, TrackTargetByIdSchema])`.

Enforce **sibling-name uniqueness within the same parent** (not scene-wide) at:

1. Factory time: `createScene`, `createLayer2D`, `createLayer3D`, `createGroup` throw on duplicate sibling names.
2. Deserialize time: `deserialize()` runs `assertSceneStructure(scene)` after rehydration.

## Rationale

Per ADR 0003 (scene.ts is authoritative for scene intent), the scene factory is called fresh on every mount — HMR reload, undo snapshot replay, project switch. Because `createRect`/`createBox`/etc. mint `crypto.randomUUID()` ids by default, a timeline keyed by `nodeId` becomes unresolvable on the next mount. Two ways out:

- Force authors to assign stable `id` strings to every node the timeline references. Rejected: no typecheck/uniqueness guarantee, and it introduces a third naming axis alongside the auto-id and the human-facing name.
- Use node names as the identity axis, addressable via a path from a named layer down to the target node. Accepted: names already exist, are already human-facing, and sibling uniqueness is a weaker (more forgiving) invariant than scene-wide uniqueness.

The id-based shape stays for studio-generated timelines (future sessions) where the GUI mints both the node and the track in the same transaction — ids are more ergonomic there. Hand-authored / hand-editable `timeline.json` uses path.

## Consequences

- `TrackTargetJSON` is now a union; code consuming it must narrow via `isTrackTargetByPath` or `"nodePath" in target`.
- Sibling name uniqueness is a new scene invariant. It throws at factory and deserialize. Mutating `node.children.push(...)` after construction is not intercepted in v1 — if the studio grows runtime scene mutation (session 08), the command layer validates before applying.
- `assertSceneStructure` is the single post-construction guard and is re-usable by the project loader + any future runtime edits.

## Alternatives considered

- **Scene-wide unique ids.** Rejected: authors would have to coordinate ids across the whole scene; far more annoying than "don't give two siblings the same name."
- **Discriminator field (`by: "id" | "path"`).** Rejected: the shape of the remaining fields already discriminates; adding a tag is boilerplate for no typing benefit.
- **Force `timeline.json` to only use paths.** Rejected: studio-generated timeline tracks born alongside new nodes will still prefer ids; keep both.

## When to revisit

- If scene mutation becomes runtime-driven (session 08 undo/redo or the inspector), decide whether sibling-uniqueness enforcement moves into the command layer instead of/in addition to factories.
- If authors regularly rename nodes and break timelines, consider a rename-refactor tool (studio operation that walks tracks and updates paths).
