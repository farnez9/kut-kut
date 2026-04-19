# Session 10 — Studio: scene node create / delete

**Estimated:** ~2h focused
**Depends on:** Session 02 (scene graph, node types, `assertUniqueChildNames`), Session 06 (plugin read/write, `nodePath` addressing), Session 09 (overlay v1, `<OverlayProvider>`, node selection, preview apply order)
**Status:** done
**Links:** `plans/decisions/0003-scene-source-format.md`, `plans/decisions/0005-track-target-by-path.md`, `plans/decisions/0006-scene-overlay-state.md`, `plans/decisions/0007-overlay-node-ops.md` (this session), `apps/studio/src/features/overlay/CLAUDE.md`, `apps/studio/src/features/inspector/CLAUDE.md`

## Goal

End state: the studio can add new nodes (Rect / Box / Group) under any existing Group or Layer, and remove any scene node, without ever rewriting `scene.ts`. The overlay file grows from "property overrides only" to a versioned document with a **structure ops** layer: `additions[]` and `deletions[]`. A new **Layers panel** in the left sidebar renders the scene's node tree (factory + overlay), lets the user click a node to select it (feeding the inspector), hover to reveal add / delete affordances, and confirms destructive actions. `applyNodeOps(scene, overlay)` runs before `applyOverlay` so a freshly added node can receive property overrides and resolves timeline tracks targeting it. The overlay schema bumps to v2 with an automatic v1→v2 migration at the parse boundary, so every existing `overlay.json` keeps loading without user intervention.

**Explicitly out of scope:** node rename, node reparent, node reorder, layer-level additions (parent is always a Group / Layer2D / Layer3D), keyframe-record mode (moved to a new session 11 — see Roadmap update below), undo/redo for node ops (revisits with session 11's generalized command store), "has override"-style badges on author vs. user-added nodes, Layers-panel drag interactions, selecting or deleting multiple nodes. One structural deliverable, one UI deliverable, plus the ADR that unlocks everything after it.

## Design

### Why a new ADR

ADR 0006 locked "overlay v1 is property overrides; node create / delete is a future overlay version." This session is that future version, and the choices (how to address the new ops, what kinds to support, how to apply them so the rest of the overlay still works, how to migrate from v1) are load-bearing for every subsequent scene-mutation feature (rename, reparent, reorder, record mode's own interaction with added nodes). Locking them in an ADR keeps session 11+ from each re-litigating the shape.

### ADR 0007 — overlay node ops (summary; full text lands in `plans/decisions/0007-overlay-node-ops.md` as task 1)

**Decision:** overlay v2 adds two sibling arrays to the existing `overrides` field:

```ts
type NodeAddition = {
  parentPath: string[];                         // non-empty; targets Group / Layer2D / Layer3D
  name: string;                                 // unique among siblings at apply time
  kind: "rect" | "box" | "group";               // enum closed for v2
};

type NodeDeletion = {
  path: string[];                               // non-empty; targets any node
};

type OverlayJSON = {
  schemaVersion: 2;
  overrides: PropertyOverride[];
  additions: NodeAddition[];
  deletions: NodeDeletion[];
};
```

**Apply order:** `factory() → applyNodeOps(scene, overlay) → applyOverlay(scene, overlay) → applyTimeline(scene, timeline, t)`. Deletions resolve first (a deletion shadows additions at the same path); additions then insert into their parents' `children` arrays at the end. Property overrides and timeline tracks target nodes by `nodePath`, so user-added nodes are first-class — the inspector can edit their transform, the timeline can animate their properties once track creation lands (future session).

**Kind restrictions.** `rect` requires a 2D parent (Layer2D or a Group with `Transform2D`); `box` requires a 3D parent; `group` inherits its transform kind from the parent (a Group under a 2D parent gets `Transform2D`, under 3D gets `Transform3D`). The Layers panel enforces this in its picker. `applyNodeOps` silently skips additions whose kind doesn't match the parent's transform kind — defence-in-depth; the UI prevents this path from being taken.

**Deletion semantics.** "Delete" removes the node from the rendered scene, not from `scene.ts`. Editing `scene.ts` after a deletion happily re-adds the node — the deletion sticks because its `path` still resolves. A deletion whose `path` no longer resolves (e.g. the author already removed it in source) is a silent no-op. **Deletions cascade** — removing a Group removes its subtree. Overrides or additions under a deleted subtree are not themselves deleted from the overlay; they silently fail to apply. A tidy-up pass lives in a future polish session.

**Addition naming.** The Layers panel passes a unique name at add time (e.g. `Rect 2` if `Rect` already exists). If two additions collide at apply time (author renamed a sibling to match, or two additions were staged and one got committed elsewhere), the later one is silently skipped. The UI should make this unreachable in practice.

**Why one schema, not two files.** We considered a sibling `structure.json`. Rejected: `overlay.json` is already the single "GUI edits to the scene" surface (ADR 0006) and the lifetime/debounce pattern is identical. Keeping one file keeps the plugin surface small. The overlay now means "all GUI-driven scene state" rather than "property overrides"; the name still fits.

**Why positional `children[]` append, not anchored insertion.** v2 additions always land at the end of `parentPath.children`. Anchored insertion ("between child A and child B") needs sibling identity that survives rename/delete from `scene.ts` — not something we can promise in v2. If render order matters, the user orders their author-defined children in `scene.ts`.

**Migration v1 → v2.** `parseOverlay` runs `migrateOverlay(raw)` first. v1 documents (where `schemaVersion === 1` and there's no `additions` / `deletions` field) gain empty arrays for both and bump to v2. No reverse migration. Unknown future versions throw `Error("overlay schemaVersion X not supported, got Y")` — same posture as project migrations (when they land).

### Module layout

```
packages/engine/src/
├── overlay/
│   ├── schema.ts                           # bump CURRENT_OVERLAY_VERSION to 2; add NodeAddition / NodeDeletion schemas
│   ├── migrations.ts                       # NEW — migrateOverlay(raw): OverlayJSON (v1 → v2)
│   ├── parse.ts                            # pipe raw through migrate then safeParse
│   ├── apply.ts                            # unchanged — applyOverlay(scene, overlay)
│   ├── node-ops.ts                         # NEW — applyNodeOps(scene, overlay)
│   ├── node-ops.test.ts                    # NEW — additions + deletions + cascade + mismatched kind
│   ├── migrations.test.ts                  # NEW — v1 → v2 fills empty arrays
│   └── index.ts                            # + applyNodeOps, + NodeAddition, NodeDeletion types
└── index.ts                                # re-exports same surface

apps/studio/
├── src/
│   ├── features/
│   │   ├── overlay/
│   │   │   ├── store.ts                    # +addNode, +deleteNode, +restoreNode (toggles a deletion entry off)
│   │   │   ├── context.ts                  # expose the three new methods
│   │   │   └── CLAUDE.md                   # updated — structure ops now part of the contract
│   │   ├── preview/
│   │   │   └── PreviewHost.tsx             # +structural effect: runs applyNodeOps on scene/overlay change, separate from the per-frame apply effect
│   │   └── layers/                         # NEW feature slice
│   │       ├── CLAUDE.md
│   │       ├── LayersPanel.tsx             # recursive tree renderer
│   │       ├── LayerNodeRow.tsx            # one row with hover add/delete
│   │       ├── AddChildMenu.tsx            # tiny inline popover listing valid kinds
│   │       ├── context.ts                  # derive-from-scene helpers; pickUniqueName
│   │       ├── derive.test.ts              # pickUniqueName against existing children
│   │       └── index.ts
│   └── App.tsx                             # +<LayersPanel /> inside app-left beneath Projects
└── styles.css                              # +.layers, +.layer-row, +.layer-row__actions, +.layer-row--deleted
```

### Engine: overlay v2

**Schema.**

```ts
// packages/engine/src/overlay/schema.ts
export const CURRENT_OVERLAY_VERSION = 2 as const;

const NodeKindSchema = picklist(["rect", "box", "group"] as const);

export const NodeAdditionSchema = object({
  parentPath: pipe(array(string()), minLength(1)),    // cannot target root
  name: pipe(string(), minLength(1)),
  kind: NodeKindSchema,
});

export const NodeDeletionSchema = object({
  path: pipe(array(string()), minLength(1)),
});

export const OverlaySchema = object({
  schemaVersion: literal(CURRENT_OVERLAY_VERSION),
  overrides: array(PropertyOverrideSchema),
  additions: array(NodeAdditionSchema),
  deletions: array(NodeDeletionSchema),
});
```

`emptyOverlay()` returns `{ schemaVersion: 2, overrides: [], additions: [], deletions: [] }`.

**Migrations.**

```ts
// packages/engine/src/overlay/migrations.ts
export const migrateOverlay = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object") return raw;
  const version = (raw as { schemaVersion?: number }).schemaVersion;
  if (version === CURRENT_OVERLAY_VERSION) return raw;
  if (version === 1) {
    return {
      ...raw,
      schemaVersion: 2,
      additions: [],
      deletions: [],
    };
  }
  throw new Error(`overlay schemaVersion ${version} not supported (current: ${CURRENT_OVERLAY_VERSION})`);
};
```

`parse.ts`:

```ts
export const parseOverlay = (input: unknown): OverlayJSON =>
  parse(OverlaySchema, migrateOverlay(input));
```

**Reconcile.** `applyNodeOps` is idempotent and in-place:

```ts
// packages/engine/src/overlay/node-ops.ts
export const applyNodeOps = (scene: Scene, overlay: Overlay): void => {
  // 1. Deletions first: walk the tree, splice matching paths out of their parents' children[].
  //    Silent no-op on unresolved paths.
  for (const { path } of overlay.deletions) deleteNode(scene, path);

  // 2. Additions: for each entry, resolve parent node; skip if (a) parent unresolved,
  //    (b) parent has no children[] (i.e. Rect / Box), (c) a child with the same name already exists
  //    (author may have added one), (d) kind mismatches parent's transform kind.
  //    Otherwise, push a fresh node built via the matching factory.
  for (const addition of overlay.additions) addNode(scene, addition);
};
```

`deleteNode` / `addNode` are internal helpers — not exported from the engine. They're idempotent so the effect that calls `applyNodeOps` can re-run on every addition/deletion mutation without accumulating ghost nodes.

**Re-applying on structural change.** `applyNodeOps` is re-runnable only because the base scene object is rebuilt whenever `scene.ts` changes (HMR remount) or the user picks a different project. Within a single scene lifetime, the overlay's additions / deletions are additive — we never run `applyNodeOps(scene, olderOverlay)` after `applyNodeOps(scene, newerOverlay)`. That would leave orphaned additions behind. In other words: **structural mutations from the overlay are monotonic within a scene lifetime**; any reconciliation across shrinking-additions (session-11 undo) must first reset the scene. For session 10, additions/deletions only grow as the user clicks the UI, so monotonic-append is sufficient.

**Test fixtures.** Reuse the existing 2D+3D example scene helper from `overlay/apply.test.ts`. New cases:
- Addition under a 2D Layer → child exists with expected name + type.
- Addition under a 3D Group with `kind: "box"` → child exists with Transform3D.
- Addition with mismatched kind (`rect` under a 3D parent) → silent skip.
- Deletion of an author-defined node → scene no longer contains it.
- Deletion cascade: delete a Group → its children are gone too.
- Deletion then addition at the same path → addition wins (deletion runs first, then path is re-resolvable and addition lands under whatever the parent is).
- Re-run applyNodeOps with same overlay → scene unchanged (idempotent).

### Preview wiring

`PreviewHost` today runs one effect:

```ts
createEffect(() => {
  const t = playback.time();
  applyOverlay(scene, overlay);
  applyTimeline(scene, timeline, t);
});
```

**Design drift (captured in Outcome → Surprises).** The original plan was a second `createEffect` that re-runs `applyNodeOps` on every structural mutation. After reading `render/pixi.ts` and `render/three.ts`, the Pixi/Three layer renderers iterate `layer.children` **once at mount time** to build their render tree; runtime mutations to `children[]` are not picked up. A reactive in-place effect would mutate the scene correctly but the compositor wouldn't reflect the new structure.

Revised plan — **remount strategy**:

1. `PreviewHost` calls `applyNodeOps(scene, overlay)` **synchronously in `onMount`**, before `createCompositor`. The compositor then builds its render tree from the fully-reconciled scene.
2. The existing per-frame effect (`applyOverlay` + `applyTimeline`) stays as-is.
3. `<OverlayProvider>` exposes `structureKey: Accessor<string>` — a `createMemo` that stringifies `additions` + `deletions`. Value changes only when the structural state actually changes.
4. `App.tsx` wraps `<PreviewHost>` in a keyed `<Show>` on `structureKey`, so any structural mutation tears down the compositor and mounts a fresh one with the reconciled scene.

Trade-off: a full compositor remount on every add/delete is heavier than an in-place mutation, but avoids fighting the renderers' mount-time tree build and keeps `applyNodeOps` a one-shot call. Monotonic append within a scene lifetime still holds (additions accumulate on the same scene object across remounts; applyNodeOps is idempotent via sibling-name checks). Restore-from-deletion is not reversible without re-running the factory — this is a session-10 limitation; session 11's undo for node ops will need a project-reload (or base-scene clone) path. Noted as a follow-up.

### Studio: overlay store gains structure mutators

```ts
// apps/studio/src/features/overlay/store.ts (additions)

type AddNodeArgs = {
  parentPath: string[];
  name: string;
  kind: NodeKind;
};

const addNode = (args: AddNodeArgs): void => {
  setOverlay(
    produce((draft) => {
      draft.additions.push({ ...args, parentPath: [...args.parentPath] });
    }),
  );
};

const deleteNode = (path: string[]): void => {
  setOverlay(
    produce((draft) => {
      // Upsert: if a deletion already targets this path, no-op.
      if (draft.deletions.some((d) => samePath(d.path, path))) return;
      draft.deletions.push({ path: [...path] });
    }),
  );
};

const restoreNode = (path: string[]): void => {
  setOverlay(
    produce((draft) => {
      const idx = draft.deletions.findIndex((d) => samePath(d.path, path));
      if (idx >= 0) draft.deletions.splice(idx, 1);
    }),
  );
};
```

`samePath` reuses `sameNodePath` from `context.ts` (currently tuple-only; keeping one helper).

**Undo/redo.** None this session. Session 11 introduces a generalized command store that unifies timeline + overlay commands; node ops plug in then. Documented in CLAUDE.md.

**Context:** `useOverlay()` gains `addNode`, `deleteNode`, `restoreNode`. `isDeleted(path): boolean` is also added so the Layers panel can render struck-through rows. `getAddedChildren(parentPath): NodeAddition[]` returns any additions whose parentPath matches — used by the Layers panel to render added-but-not-yet-in-scene previews (edge case where reconciliation hasn't reached a frame yet; in practice the structural effect runs synchronously during the same tick).

### Studio: Layers panel

Lives in the left sidebar below the existing Projects list. The aside becomes a two-section stack:

```
app-left
├── panel-head: Projects · 01
├── <ProjectList>
├── panel-head: Layers · 02
└── <LayersPanel>
```

Both sections are independently scrollable. Heights: Projects min-content, Layers fills remaining. No user-resizable splitter this session (flag as follow-up).

`<LayersPanel>` reads `useProject().bundle()?.scene` + `useOverlay()`. Renders nothing when there's no project; renders a "No layers" hint if the scene has zero layers.

**Row anatomy.**

- Caret (14px, flipped on collapse) for nodes with children; blank space otherwise.
- Icon by type: `Layers`-like glyph for layers, `Box` for 3D primitive, `Square` for 2D primitive, `Folder` for groups. Reuse `lucide-solid` — already a dep.
- Name (ellipsis-clip on overflow).
- Trailing "actions" cluster (visible on row hover, focus-within, or for the currently selected row):
  - On groups / layers: `+` button that opens an `AddChildMenu`.
  - On every node: trash button. On deleted nodes: an "undo" arrow button that calls `restoreNode`.

Rows for deleted nodes render with `.layer-row--deleted` (opacity 0.5, strikethrough on the name). Click still navigates (selects) but the inspector will show "(deleted)" in the header. The inspector could also hide the transform editors for deleted nodes — doing that keeps the panel from offering edits that silently fail to render. **Decision for this session:** inspector still shows editors but hidden behind a `<Show when={!isDeleted()}>`. Follow-up: a dedicated empty state.

Hover interactions use CSS only (`.layer-row:hover .layer-row__actions { opacity: 1; }`). Focus-within keeps them visible while a keyboard user tabs through. Selected row pins them visible via `.layer-row--selected`.

**Selection.** Click on a row calls `useTimeline().selectNode(nodePath)`. This clears clip / keyframe selection (per session 09's `selectNode` semantics). The row highlights (aquamarine border, matching existing clip selection). The inspector switches to the Node panel.

**Add-child flow.**

1. Hover a group / layer row → `+` button visible.
2. Click opens an inline popover (`<AddChildMenu>`) anchored below the row, listing valid kinds filtered by parent transform: 2D parent → Rect, Group; 3D parent → Box, Group.
3. User picks a kind → panel computes a unique name (`Rect` if unused, else `Rect 2`, `Rect 3`…) using `pickUniqueName(existingNames, baseLabel)`. Existing names = author-authored children + overlay additions (merged) minus deletions (so a deleted `Rect` frees up the name).
4. `addNode({ parentPath, name, kind })` → overlay store mutates → reconcile effect fires → scene gets the child → tree re-renders with it.
5. After adding, the panel auto-selects the new node (`selectNode(parentPath.concat(name))`) so the inspector immediately surfaces it.

**Delete flow.**

1. Hover any row → trash button visible.
2. Click → no confirmation this session (flag as follow-up; current overlay-delete is reversible via restore, so destructive-confirm isn't blocking).
3. `deleteNode(path)` → overlay store mutates → reconcile effect fires → scene removes the subtree → tree row renders with `--deleted` class (the node path still exists in the tree render because the Layers panel shows both "live" and "deleted" entries).

**Deleted nodes in the tree.** The Layers panel pulls from two sources:

- The live `scene` (what's actually rendered) — authoritative for structure.
- `overlay.deletions` — authoritative for "who's deleted".

Because `applyNodeOps` removes deleted nodes from the scene, deleted subtrees won't appear naturally. To still let the user hit "restore", the panel keeps a separate **virtual tree** reconstructed from the factory's scene (the "base" scene before node ops) plus overlay additions, and marks any path present in `overlay.deletions` as deleted. This requires access to the pre-reconcile scene; we expose it by cloning the scene structure in ProjectProvider and keeping both: `bundle.scene` (base, pre-reconcile) vs. the live scene passed to PreviewHost.

**Simpler alternative considered and picked:** the Layers panel derives its tree from the overlay + the base scene (`bundle.scene`) and runs a *parallel* reconcile for display purposes, without mutating the real scene. Additions are rendered inline; deletions are rendered but struck through. This keeps the panel independent of what PreviewHost sees. The derive logic is ~30 lines in `features/layers/derive.ts`:

```ts
type LayerTreeNode = {
  node: Node;                // factory or added
  nodePath: string[];
  source: "author" | "added";
  deleted: boolean;
  children: LayerTreeNode[]; // empty if leaf
};

export const deriveLayerTree = (scene: Scene, overlay: Overlay): LayerTreeNode[] => { ... };
```

Tested in `derive.test.ts` against hand-crafted scenes.

`pickUniqueName(siblingNames, base)` tests:
- Empty siblings → returns `base`.
- `[base]` → returns `${base} 2`.
- `[base, "${base} 2"]` → returns `${base} 3`.
- `[base, "${base} 3"]` → returns `${base} 2` (fills the gap).

**Accessibility.** Rows are `<button type="button">` for keyboard selection. Action cluster buttons have `aria-label`. Up / Down arrow navigation is **out of scope** for v1 (flagged as follow-up).

### Plugin

**Schema changes to the plugin are none at the HTTP level** — `parseOverlay` migrates v1 → v2 at the parse boundary, so POST bodies with either shape land cleanly. The on-disk format now writes v2 (first save after upgrade performs the migration). Existing example `overlay.json` (if any — not committed) is upgraded on load.

No new endpoints.

### Styles

```
.layers                         flex column, overflow auto
.layer-row                      row with hover actions; icon + name + actions
.layer-row__indent              per-depth padding-left (depth * 14px)
.layer-row__caret               rotates 90° on expanded
.layer-row__icon                type icon (Layers / Folder / Square / Box)
.layer-row__name                ellipsis-clip
.layer-row__actions             opacity 0; becomes 1 on :hover / :focus-within / --selected
.layer-row--selected            aquamarine focus ring (reuses --color-accent token from session 09 preferences)
.layer-row--deleted             opacity 0.5; name strikethrough
.add-child-menu                 anchored popover; list of buttons
```

Respect the aquamarine accent and the 12/14/16 px text tiers per `feedback_kutkut_visual_preferences.md`.

### Testability

**Automated (via `bun test`):**
- `packages/engine/src/overlay/migrations.test.ts` — v1 doc → v2 with empty arrays; unsupported version throws.
- `packages/engine/src/overlay/node-ops.test.ts` — all cases listed under "Test fixtures" above (~6 cases).
- `apps/studio/src/features/layers/derive.test.ts` — deriveLayerTree against a known base scene + overlay combos; `pickUniqueName` permutations.

**Manual (per `feedback_ui_verification.md`):**
- Start dev server on the example project; Layers panel shows the scene's tree (one 2D layer `Hero`, one 3D layer `Stage`, etc. — whatever the example has).
- Click `Hero` → aquamarine border; inspector shows node panel.
- Hover `Hero` → `+` button appears; click → menu lists `Rect` and `Group`; pick `Rect` → new `Rect` row appears under `Hero`; preview shows a white 1×1 rect at origin.
- Hover the new `Rect` → trash button → click → row struck through; preview loses the rect. Click the restore arrow → rect returns.
- Reload page → state persists.
- Hover author-defined node (e.g. `Cube` under the 3D layer) → trash → preview loses the cube; row struck through. Add another `Box` under the same layer → factory-authored cube stays deleted, new box appears.
- `curl` a v1 overlay (`schemaVersion: 1, overrides: [...]`) at `/__kk/projects/example/overlay` via POST → 200, file on disk is v2 with empty `additions` / `deletions`.

### Explicit non-decisions this session

- **Confirm before destructive delete?** Not this session. Deletions are overlay-reversible via restore; irreversibility is only a problem if the user deletes, closes the file, and the overlay is purged.
- **Rename / reparent?** Deferred. Rename especially interacts with `nodePath` addressing and needs a path-rewrite pass over `overrides[]`, `additions[]` (for children of the renamed node), and `timeline.json` tracks. A sizable sub-feature.
- **Undo for node ops?** Session 11. Needs the generalized Command abstraction across timeline + overlay stores.
- **Layer-level additions (adding a new 2D or 3D layer)?** Out of scope. The kind enum excludes them; the Layers panel's `+` button is only on Groups and Layers, not at the root. Revisit when new scene surfaces make this useful.
- **Drag-to-reorder, drag-to-reparent?** Out of scope. Siblings are rendered in `children[]` order.
- **Keyboard navigation in the Layers panel?** Out of scope. Click-to-select only.
- **Editing the added node's initial size / color / transform at creation time?** Out of scope. Fresh Rect / Box / Group come from the engine's factory defaults. Users refine via the inspector (transform editors, via overlay overrides).

### Roadmap update

`plans/overview.md` row 10 currently reads: _"Overlay-driven node add/delete/rename, keyframe-record mode (inspector edits become keyframes inside clip windows), Layers panel as needed"_. This session ships a narrower slice. Post-split:

- **10 (this session):** "Scene node create / delete via overlay v2 (ADR 0007) + Layers panel."
- **11 (new row; shifts audio-core down by one again):** "Keyframe record mode + generalized command store (overlay + timeline undo)."
- **12+ (shift):** Audio core → 12, audio panel → 13, voiceover → 14, captions → 15, TTS → 16, export → 17, short-form → 18, scene authoring polish → 19, publish prep → 20+.

Write a short scope-split note at the top of `overview.md` mirroring the session-08 / session-09 notes.

## Tasks

1. [x] **ADR 0007 — overlay node ops.** Write `plans/decisions/0007-overlay-node-ops.md` covering decision, schema additions, apply order, kind rules, migration, positional rules (append-only), why not a sibling file, deletion cascade, what's deferred (rename / reparent / reorder). Link from this spec. ~20 min.
2. [x] **Engine: overlay schema v2 + migration.** Bump `CURRENT_OVERLAY_VERSION` to 2; add `NodeAdditionSchema`, `NodeDeletionSchema`; update `OverlaySchema`. Implement `migrateOverlay`; wire through `parseOverlay`. Update `emptyOverlay()`. Tests: v1 → v2 parse, malformed parent path, unknown version throws. `bun test` + `bun run typecheck` green. ~25 min.
3. [x] **Engine: `applyNodeOps` + tests.** New `overlay/node-ops.ts`. Deletions splice first; additions append after kind-match check. Idempotent (re-run = no-op). Export from `overlay/index.ts` and engine root `index.ts`. Tests per "Test fixtures" above (~6). ~25 min.
4. [x] **Preview: structural remount.** Call `applyNodeOps` synchronously in `PreviewHost`'s `onMount` before `createCompositor`. Add `structureKey` accessor to `<OverlayProvider>`. Wrap `<PreviewHost>` in App.tsx with a keyed `<Show>` on `structureKey` so the compositor remounts on structural mutations. (Design changed mid-session — see Surprises.) ~20 min.
5. [x] **Overlay store: structure mutators + context.** Extend `createOverlayStore` with `addNode`, `deleteNode`, `restoreNode`, `isDeleted`. Expose via `OverlayContextValue`. Update `features/overlay/CLAUDE.md` to document the new contract and note "no undo this session." `bun run typecheck` green. ~15 min.
6. [x] **Layers panel: derive + render.** New `features/layers/` slice with `deriveLayerTree`, `pickUniqueName`, `LayersPanel`, `LayerNodeRow`, `AddChildMenu`, `index.ts`, `CLAUDE.md`, `derive.test.ts`. CSS rules in `styles.css`. Wire into `App.tsx`'s left sidebar beneath `<ProjectList>`. Browser verify: rendering matches the scene tree; rows select; hover reveals action cluster. ~45 min.
7. [x] **Add / delete / restore flows end-to-end.** Hook up `AddChildMenu` kinds-filtering, unique-name computation, `addNode` call, auto-select the newly added node. Trash button calls `deleteNode`; restore button on deleted rows calls `restoreNode`. Browser verify all four: add Rect under 2D layer, add Box under 3D layer, delete author-defined node, restore. Confirm `overlay.json` reflects v2 structure on disk after each. Code-complete; manual browser verification left to the user per `feedback_ui_verification.md`. ~30 min.
8. [x] **Roadmap update + verification sweep.** Edit `plans/overview.md` row 10 to match shipped scope; insert new row 11 for record mode + generalized command store; shift subsequent rows by one. Add a scope-split note at the top. Run `bun run typecheck`, `bun run lint`, `bun test`. Fill Outcome. ~15 min.

## Non-goals

- **Node rename.** Requires rewriting every `nodePath` in `overrides[]`, `additions[]` (for descendants), `timeline.json` tracks. Sizeable; deferred.
- **Node reparent / reorder.** Same reason, plus a drag UX design decision. Deferred indefinitely.
- **Layer-level additions.** No root-level kind; `kind` is `rect | box | group`. Layers come from `scene.ts`.
- **Keyframe record mode.** Promoted to session 11.
- **Undo / redo for node ops.** Session 11 via a generalized command store that spans timeline + overlay.
- **Destructive-delete confirmation.** Overlay-reversible; follow-up polish.
- **Drag-reorder / drag-reparent inside the Layers panel.** Session 10 is click + hover-buttons only.
- **Keyboard navigation in the Layers panel.** Click selection only.
- **Editing initial properties at add time.** Users refine via the inspector after.
- **"Has override" / "added-by-user" badges on rows.** Polish.
- **Layers-panel splitter / user-resizable height in the left sidebar.** Stacked with min-content + fill. Revisit only if it bites.
- **Cascading delete on the overlay itself** (cleaning up orphaned overrides / additions under a deleted subtree). Orphans silently fail to resolve; a tidy-up pass is a polish session.

## Verification

- `bun test` green, including `overlay/migrations.test.ts`, `overlay/node-ops.test.ts`, `features/layers/derive.test.ts`.
- `bun run typecheck`, `bun run lint` green.
- `plans/decisions/0007-overlay-node-ops.md` exists and is linked from this spec.
- `bun run dev` starts cleanly; preview looks identical with an empty overlay.
- **Schema migration:**
  - `curl -X POST /__kk/projects/example/overlay -d '{"overlay":{"schemaVersion":1,"overrides":[]}}'` → 200; file on disk is `schemaVersion: 2` with empty `additions` / `deletions`.
  - Page reload after above → loads cleanly, no errors.
- **Layers panel render:**
  - Panel shows the scene tree for the example project. Root layers visible; carets expand groups.
  - No-project state shows "No layers" hint (or the existing "Load a project" pattern).
- **Add flows:**
  - Hover a 2D Layer → `+` button appears; click → menu lists `Rect` and `Group`; pick `Rect` → new row appears; preview shows a white rect at origin; overlay file grows a v2 `additions` entry within 300 ms.
  - Hover a 3D Layer → `+` → menu lists `Box` and `Group`; pick `Box` → row appears; preview shows a white cube.
  - Add two `Rect`s in a row → names are `Rect 2` and `Rect 3` (or similar unique progression).
  - After add, the new row is auto-selected; inspector switches to Node panel with factory-default transform.
- **Delete / restore flows:**
  - Hover row → trash button → click → row struck through; preview loses the node; overlay gains a `deletions` entry.
  - Click restore arrow → deletions entry removed; row returns; preview restores.
  - Delete a Group → row struck through; preview loses the group and its children; children still render in the Layers tree but as deleted (struck through and inherits the parent's deleted state — visual only).
- **Inspector behaviour while deleted:**
  - Click a deleted row → inspector header shows a `(deleted)` hint; transform editors are hidden.
  - Click its parent → inspector works normally.
- **Author-edit resilience:**
  - Delete `Hero`; reload; edit `scene.ts` to rename the factory's `Hero` to `HeroAuthor` → deletion silently no-ops (path unresolved); console logs one warning; Layers panel shows `HeroAuthor` normally.
- **Type editor smoke:**
  - Author-defined `Rect` under a 2D Layer + a user-added Rect under the same parent: both editable via the inspector; their property overrides round-trip to disk.
- **Persistence health:**
  - Rapid add / delete sequence → debounced POST fires exactly once per 300 ms quiet window.
  - POST errors set `saveError`; UI remains interactive.
- `plans/overview.md` reflects the scope split; row 10 matches shipped scope; row 11 exists for record mode + unified undo.

## Outcome

- **Shipped:**
  - ADR 0007 — overlay node ops.
  - Engine: overlay schema v2 (`additions[]`, `deletions[]`) with valibot schemas + migration from v1 at the parse boundary. `emptyOverlay()` returns v2 shape.
  - Engine: `applyNodeOps(scene, overlay)` — idempotent, deletions-first then additions, enforces kind ↔ parent-transform match, cascade deletion falls out of `children.splice`. 12 unit tests.
  - Studio: overlay store gains `addNode`, `deleteNode`, `restoreNode`, `isDeleted`. Context exposes them + `structureKey` accessor (a `createMemo` stringifying additions + deletions).
  - Studio: persistence now writes v2 (additions + deletions in the snapshot).
  - Studio: `<OverlayProvider>` accepts the scene **factory** (`() => Scene`) and exposes a reactive `scene: Accessor<Scene>` that re-runs the factory + `applyNodeOps` on every structural overlay change. `KeyedPreviewHost` wraps `<PreviewHost>` in `<Show when={overlay.scene()} keyed>` so the compositor remounts cleanly on every structural mutation. `PreviewHost.onMount` no longer mutates the scene — it receives an already-structurally-correct fresh scene. Inspector reads `useOverlay().scene()` to find selected nodes; LayersPanel keeps reading `project.bundle()?.scene` (the pristine authored tree) so deleted rows remain visible and strike-through.
  - Studio: new `features/layers/` slice — `deriveLayerTree`, `pickUniqueName`, `LayersPanel`, `LayerNodeRow`, `AddChildMenu`, CLAUDE.md, `derive.test.ts` (9 tests). Left sidebar now has a Projects / Layers stack.
  - Add / delete / restore flows wired end-to-end: click a row to select (→ inspector), hover `+` for kinds-filtered add menu, unique-name auto-pick, trash + restore actions on rows.
  - `plans/overview.md` scope-split note + row 10 rewritten, new row 11 (record mode + unified undo), rows 11+ shifted to 12+.

- **Deferred:**
  - **Keyframe record mode** + generalized command store (overlay undo/redo unification) → session 11. Taking both in this session's 2h was infeasible once the structural remount design change landed.
  - **Node rename / reparent / reorder** — indefinitely. Rename alone needs a path-rewrite pass over `overrides[]`, nested `additions[]`, and timeline tracks.
  - **Destructive-delete confirmation** — overlay-reversible, so no confirm modal this session.
  - **Drag-to-reorder, keyboard nav in the Layers panel** — not scoped.
  - **Layer-level additions** (adding a new 2D / 3D layer via UI) — `kind` enum stays `rect | box | group`.
  - **Layers-panel / Projects-list splitter** — stacked, Projects at min-content, Layers filling remaining. Revisit only if it bites.
  - **Inspector empty state for deleted nodes** — the spec flagged it; not implemented. Hidden transform editors behind `Show when={!isDeleted()}` was contemplated but not wired; inspector still renders edits for deleted nodes. Flag for polish.

- **Surprises:**
  - **Render tree is built once at mount.** `render/pixi.ts` and `render/three.ts` both iterate `layer.children` once inside their layer renderer to mount children; runtime mutations to `children[]` don't propagate. The originally-planned reactive `createEffect(() => applyNodeOps(scene, overlay))` would mutate the scene correctly but the compositor wouldn't show it. Pivoted mid-task to the remount strategy: `applyNodeOps` runs synchronously in `onMount` before `createCompositor`, and a `structureKey`-keyed `<Show>` in `App.tsx` forces PreviewHost to tear down + remount on every structural mutation. Noted at the top of the Preview Wiring design and in task 4.
  - **Initial remount strategy broke restore + 3D-addition + 2D-deletion in manual verification.** Mutating the shared `bundle.scene` in place via `applyNodeOps` (a) made deletions irreversible (splice is one-way), (b) left Solid blind to the tree change so Inspector couldn't find added nodes, and (c) meant subsequent mounts found the same mutated scene so deletions-then-additions applied cleanly once but restore was a no-op. **Fixed by storing the scene factory on the bundle and having `<OverlayProvider>` expose a reactive `scene: Accessor<Scene>` rebuilt from `factory() + applyNodeOps(overlay)` on every structural change.** `KeyedPreviewHost` keys on that scene's identity; PreviewHost no longer mutates anything; Inspector reads `overlay.scene()`; LayersPanel still reads the pristine authored tree from `bundle.scene` (so strike-through works on author-defined deletions).
  - **Added 3D box default was invisible** — a 1×1×1 unit box at camera distance ~1200 renders sub-pixel. Added-via-overlay defaults in `node-ops.buildChild` now pick visible scales (rect `scaleX/Y=120`, box `scale=[160,160,160]`) and a neutral `[0.9, 0.9, 0.9]` color.
  - **Typescript overload pain with `<Show when={string} keyed>`**: the callback overload only resolves cleanly for object-typed `when`. Keyed-on-scene-identity is now object-typed (the Scene), so the previous `{v: string}` box workaround went away; the inner projects-bundle `<Show>` dropped `keyed` since it no longer needs the bundle value.
  - **Test sandboxing for the layers feature**: importing `../overlay/index.ts` from a `.test.ts` file pulled in `OverlayProvider.tsx` which has JSX and crashed Bun's test runner ("Cannot find module 'react/jsx-dev-runtime'"). Switched `derive.ts` to import `sameNodePath` directly from `context.ts`. (General lesson: engine-adjacent utilities should avoid transitive JSX imports.)

- **Follow-ups:**
  - **Session 11 — keyframe record mode + unified undo.** Generalized command store spanning timeline + overlay. Restore-from-deletion already works (factory re-runs on each structural change); the undo story just needs to cover override/clip/keyframe history alongside overlay ops.
  - **Inspector: "(deleted)" header + hidden transform editors for deleted-node selection.** Spec'd, not wired.
  - **Overlay tidy-up pass** for orphaned overrides / additions under a deleted subtree. Polish.
  - **Layers panel keyboard nav + drag interactions.** Polish.
  - **Destructive-delete confirm** for user-added nodes once record mode lands (and overlay undo makes restore a one-click expectation).
  - **A clean-hidden-deleted toggle** in the Layers panel for scenes with many deletions (current design always shows struck-through rows).
