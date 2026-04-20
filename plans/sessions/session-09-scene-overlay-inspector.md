# Session 09 — Studio: scene overlay + inspector editing

**Estimated:** ~2h focused
**Depends on:** Session 02 (scene graph, node naming), Session 06 (project loader, plugin endpoints, `nodePath` resolution), Session 08 (inspector panel, selection plumbing)
**Status:** done
**Links:** `plans/decisions/0003-scene-source-format.md`, `plans/decisions/0005-track-target-by-path.md`, `plans/decisions/0006-scene-overlay-state.md`, `apps/studio/src/features/inspector/CLAUDE.md`, `apps/studio/src/features/timeline/CLAUDE.md`

## Goal

End state: the studio can mutate scene-node properties from the GUI and persist those edits without ever rewriting `scene.ts`. A new `projects/<name>/overlay.json` holds a list of "overrides" keyed by `nodePath` + property; the engine applies them after the scene factory runs and before the timeline evaluator. The inspector, read-only after session 08, gains property editors for the selected scene node's transform (2D: x/y/rotation/scaleX/scaleY/opacity; 3D: position/rotation/scale/opacity). Selection now includes an optional `nodePath`; clicking a timeline clip sets the track's target node as the selected node, so inspector edits affect the same node the user was already working with. Overrides round-trip to disk through the same debounced plugin client pattern the timeline uses. Secondary deliverable: a **collapse toggle** in the timeline panel head shrinks the entire bottom strip (clips / keyframes / ruler) to a single-row header, giving the preview + inspector the full pane when you're focused on scene-level editing; state persists in `localStorage`. **Explicitly out of scope:** node create/delete, keyframe-record mode, non-transform property editors (color, etc.), a "Layers" tree panel, undo/redo integration for overlay edits — each one gets its own session. This session ships the architectural foundation (the ADR + the overlay pipeline) plus one end-to-end proof-of-life (inspector transform editing) so the rest is mechanical.

## Design

### Why this needs an ADR

ADR 0003 locked "`scene.ts` is author intent; GUI-driven scene edits persist elsewhere" but deferred the "elsewhere" to this session. Every downstream session that mutates scene structure or properties from the GUI (node add/delete, record mode, color editing, eventually 3D gizmos) needs to know where that state lives and how it layers with the timeline. Writing ADR 0006 first keeps the rest of the sessions from each redesigning it.

### ADR 0006 — scene overlay state file (summary; full text lands in `plans/decisions/0006-scene-overlay-state.md` as task 1)

**Decision:** overlay state for each project lives in `projects/<name>/overlay.json`. It is a schema-versioned JSON document, validated at the plugin boundary (same posture as `timeline.json`, per ADR 0002). In v1 the overlay carries only **property overrides**: an array of `{ nodePath: string[]; property: string; value: OverrideValue }` entries. Node create / delete / reparent lands in a future overlay version and a future session — out of scope now, but the schema is versioned so we can grow it without migrations fighting us.

**Value shape.** `OverrideValue = number | [number, number, number]` for v1 (numbers cover transform scalars + opacity; the triple covers 3D position/rotation/scale). We do **not** generalise to arbitrary JSON; every property the inspector writes must have a known numeric shape so schema validation stays total. Color (`Vec3` triple) can be added at the same schema version later — identical shape.

**Load / apply order.**
1. `scene.ts` factory runs → fresh scene with author-declared base values.
2. `applyOverlay(scene, overlay)` walks each override entry, resolves the node via `findNodeByPath`, writes via the same `resolveProperty` the timeline uses (so there's one property-addressing codepath — see `applyTimeline`).
3. Per-frame `applyTimeline(scene, timeline, t)` runs after, and is free to override again while inside a clip. **Animation always wins inside its clip window.** Outside clips, the overlay value sticks.

**Conflict rule.** An override for a property that a timeline track animates is allowed (not an error). Inside the animated clip, the timeline evaluator writes over the overlay every frame; outside the clip, the overlay's static value is what the user sees. Deferred-to-session-10 record mode is what collapses that ambiguity: typing a value while inside a clip at the current playhead writes a **keyframe** (timeline mutation), not an overlay entry. This session doesn't distinguish — inspector edits always write the overlay. Surfacing this to the user as a "Recording vs. static" toggle is session 10's concern.

**Addressing.** Overlay uses `nodePath`, not `nodeId`, for the same reason the timeline does (ADR 0005): factory-minted ids are ephemeral. Paths like `["2D", "Hero"]` survive remounts and are editable by hand if need be. If an override can't be resolved on load (node was renamed or deleted from `scene.ts`), we log a warning and skip it — do not throw. Same posture as the timeline's current silent-skip behaviour for unresolved targets; session-17 polish will add a diagnostic panel.

**Why not a patch / event log?** Two candidates considered:
- **Current-state diff (chosen):** `overrides[]` is a snapshot of *what the overlay currently says*. Idempotent apply; easy to reason about; easy to clamp at the schema boundary.
- **Patch log:** `[{op, path, value, ts}, ...]` with replay. Rejected for v1 because (a) the set of actions is still tiny, (b) we already have undo/redo in the command store for ephemeral history, (c) patch logs grow unboundedly and need compaction, (d) hand-editing a diff is obvious; hand-editing a patch log is a footgun. Revisit if we grow collaborative / multi-user editing (not on the roadmap).

**Why not merge into `timeline.json`?** `timeline.json` is already schema-bound to `TimelineJSON` (tracks/clips/keyframes). Grafting overlay into it would either require a breaking schema bump or an awkward side-channel. Separate file keeps the two boundaries clean, and future multi-format work (e.g. exporting a zip bundle) can opt in to shipping both or just one.

### Module layout

```
packages/engine/src/
├── overlay/                               # NEW submodule
│   ├── index.ts
│   ├── apply.ts                           # applyOverlay(scene, overlay)
│   ├── schema.ts                          # OverlayJSON, OverlaySchema, CURRENT_OVERLAY_VERSION
│   ├── parse.ts                           # parseOverlay (valibot)
│   └── apply.test.ts                      # unit tests: override 2D scalar + 3D vec3
└── index.ts                               # + export overlay surface

apps/studio/
├── vite/
│   └── project-fs.ts                      # +GET /__kk/projects/:name returns {overlay}, +POST /__kk/projects/:name/overlay
└── src/
    ├── lib/
    │   └── plugin-client.ts               # +writeOverlay(name, json)
    ├── features/
    │   ├── project/
    │   │   ├── context.ts                 # ProjectBundle gains {overlay: Overlay}
    │   │   └── ProjectProvider.tsx        # load overlay alongside timeline
    │   ├── overlay/                       # NEW feature slice
    │   │   ├── CLAUDE.md
    │   │   ├── OverlayProvider.tsx
    │   │   ├── context.ts                 # useOverlay(), OverlayContextValue
    │   │   ├── store.ts                   # createOverlayStore — setOverride, removeOverride
    │   │   ├── persistence.ts             # useOverlayPersistence — debounced POST
    │   │   └── index.ts
    │   ├── preview/
    │   │   └── PreviewHost.tsx            # + applyOverlay before every applyTimeline
    │   ├── timeline/
    │   │   └── context.ts                 # TimelineSelection gains nodePath; selectNode(path)
    │   └── inspector/
    │       ├── Inspector.tsx              # + NodePanel branch
    │       ├── NodePanel.tsx              # NEW — transform editors
    │       ├── editors/                   # NEW — small numeric input primitives
    │       │   ├── NumberInput.tsx
    │       │   └── Vec3Input.tsx
    │       └── CLAUDE.md                  # updated — editing no longer read-only
└── App.tsx                                # + <OverlayProvider>, timeline collapse signal + localStorage
```

### Timeline collapse toggle

A chevron button sits on the right side of the timeline's `.panel-head` (adjacent to the existing `.panel-head__index` "03" badge), opposite the `Timeline` label. Clicking it flips a `collapsed` boolean; when true:

- The CSS variable `--tl-height` drops from the user's last resized height (default 260 px) to `var(--tl-collapsed-height, 40px)` — just the panel-head strip, no body, no ruler.
- `<TimelineResizer>` is hidden (`<Show when={!collapsed()}>`) so the drag handle isn't grabbable against a 0-height body.
- `<TimelineBody>` is hidden the same way, freeing layout height for the preview.
- The chevron rotates 180° to indicate "expand".

State model: the `Shell` signal pair is `[collapsed, setCollapsed]` and `[tlHeight, setTlHeight]`. The computed height passed to the grid is `collapsed() ? TL_COLLAPSED_HEIGHT : tlHeight()`; the user's chosen height is preserved across collapse/expand. A tiny `lib/local-storage.ts` (or inline in `App.tsx` — prefer inline for ~6 lines) persists `collapsed` and `tlHeight` under keys `kk:timeline:collapsed` / `kk:timeline:height`; loaded once on mount, written via `createEffect` with `on(..., { defer: true })`. Per-project persistence is not needed; collapse is a workspace preference.

Keyboard: no hotkey this session. If one lands later, it slots alongside the playback hotkeys (currently space / home) under a single `useGlobalHotkeys` registry. Flagged as a Follow-up if wanted.

Empty-project case: when no project is loaded the timeline already renders a "Load a project to see its timeline." stub. Collapse still works; the header hint stays visible so the affordance is discoverable.

### Schemas

```ts
// packages/engine/src/overlay/schema.ts
export const CURRENT_OVERLAY_VERSION = 1 as const;

export const OverrideValueSchema = union([
  number(),
  tuple([number(), number(), number()]),
]);

export const PropertyOverrideSchema = object({
  nodePath: array(string()),
  property: string(),
  value: OverrideValueSchema,
});

export const OverlaySchema = object({
  schemaVersion: literal(CURRENT_OVERLAY_VERSION),
  overrides: array(PropertyOverrideSchema),
});

export type OverrideValue = InferOutput<typeof OverrideValueSchema>;
export type PropertyOverride = InferOutput<typeof PropertyOverrideSchema>;
export type OverlayJSON = InferOutput<typeof OverlaySchema>;
export type Overlay = OverlayJSON; // runtime shape identical in v1
```

`parseOverlay(raw)` uses `safeParse` → throws on failure with a readable message (match `parseTimeline`'s posture). An empty-but-valid overlay is `{ schemaVersion: 1, overrides: [] }`. `deserializeOverlay` (returns `null` when the file is missing; returns a parsed overlay otherwise) is the loader-side helper; persistence always writes a full document even when `overrides` is empty, so the on-disk file exists once anyone has touched it.

### Engine `applyOverlay`

Pure and synchronous, mirrors `applyTimeline`'s structure to keep the mental model single:

```ts
// packages/engine/src/overlay/apply.ts
const resolveNode = (scene: Scene, nodePath: string[]) => findNodeByPath(scene, nodePath);

const writeOverride = (node: Node, property: string, value: OverrideValue): void => {
  const resolved = resolveProperty(node, property); // reused from apply.ts, pulled out to a shared module
  if (!resolved) return;
  if (typeof value === "number" && resolved.kind === "number") resolved.set(value);
  else if (Array.isArray(value) && resolved.kind === "vec3") resolved.set(value);
  // any mismatch is silently skipped — schema keeps types consistent at the boundary; this is defence in depth only
};

export const applyOverlay = (scene: Scene, overlay: Overlay): void => {
  for (const entry of overlay.overrides) {
    const node = resolveNode(scene, entry.nodePath);
    if (!node) continue;
    writeOverride(node, entry.property, entry.value);
  }
};
```

**Refactor:** `resolveProperty` today only handles `Property<number>` in `timeline/apply.ts`. We widen it to include `Property<Vec3>` and move it to a shared internal module (`packages/engine/src/reactive/resolve-property.ts`). The timeline keeps its numeric-only guard at the call site. This is the only engine-internal refactor this session and stays inside one commit/task.

### Plugin

```
GET  /__kk/projects/:name         # existing — response now also carries overlay
POST /__kk/projects/:name/overlay # NEW — writes overlay.json
```

`readProjectHandler` reads `overlay.json` if it exists, runs it through `parseOverlay`, returns `{ name, timeline, assets, overlay }` with `overlay: null` when missing. The request body shape for the write endpoint mirrors timeline: `{ overlay: OverlayJSON }`, validated via `parseOverlay`, written as `${JSON.stringify(validated, null, "\t")}\n` to match the timeline file's on-disk format. 400 on schema failure, same error body shape as the timeline endpoint.

### Studio: overlay feature slice

`<OverlayProvider name overlay>` mirrors `<TimelineProvider>`:

```ts
// apps/studio/src/features/overlay/context.ts
export type OverlayContextValue = {
  name: Accessor<string>;
  overlay: Store<Overlay>;
  setOverride: (nodePath: string[], property: string, value: OverrideValue) => void;
  removeOverride: (nodePath: string[], property: string) => void;
  getOverride: (nodePath: string[], property: string) => OverrideValue | undefined;
  saveState: Accessor<OverlaySaveState>;
  saveError: Accessor<Error | null>;
};

export const OverlayContext = createContext<OverlayContextValue>();
```

`setOverride` is "upsert" semantics on the `overrides` array — find the entry with matching `nodePath` (deep equal) + `property`, mutate in place, or push a new entry. `removeOverride` is delete-if-exists. The store uses `createStore<Overlay>` + `produce` and the persistence hook uses the same debounced-POST pattern as `useTimelinePersistence` (300 ms debounce, single-flight, error state surfaces through the hook).

**No undo/redo** for overlay in session 09. The timeline's command store is its own history; overlay gets its own history or a merged one when node-create/delete lands in session 10 (decision punted to that session).

**HMR / remount.** `<OverlayProvider>` lives inside the `<Show when={project.bundle()} keyed>` block in `App.tsx`, same as `<TimelineProvider>`, so project swap and scene HMR both remount both providers and both histories reset (overlay has no history anyway, so this is free).

### Preview wiring

`PreviewHost` gains a second apply call. Today it does:

```ts
createEffect(() => applyTimeline(scene, timeline, playback.time()));
```

New pipeline:

```ts
// one effect, tracks time; overlay re-applies every frame before timeline
createEffect(() => {
  const t = playback.time();
  applyOverlay(scene, overlay);
  applyTimeline(scene, timeline, t);
});
```

Order matters: overlay runs first (sets "static" base values); timeline runs after (writes animated values on top). A single merged effect guarantees overlay re-applies each frame — critical because `applyTimeline` writes nothing outside a clip's window, so a property that was just animated would otherwise keep its last animated value forever. With overlay re-applied per frame, the static override reappears the instant the playhead exits the clip. Cost is negligible: `applyOverlay` is O(overrides) and idempotent.

**Edge case:** a property with an overlay override and an active track *outside* the track's clip window. With the merged effect, overlay writes the static value first; the timeline sees `evaluateClip` return undefined and early-returns via `applyTrack`'s `if (value === undefined) return` guard — overlay wins. With the original two-effect design the timeline's last intra-clip write stuck, which was the bug caught during manual verification.

### Selection: node axis

`TimelineSelection` becomes `{ clipId, keyframeId, nodePath }`. The existing `selectClip` / `selectKeyframe` / `clearSelection` helpers are extended:

- `selectClip(id)` — also sets `nodePath` to the clip's track target's `nodePath` (skip if track is `nodeId`-targeted; those live in studio-generated timelines that don't exist yet in session 09).
- `selectKeyframe(clipId, index)` — same: derives `nodePath` from the owning clip's track.
- `clearSelection()` — clears all three.
- **NEW** `selectNode(nodePath)` — clears clipId/keyframeId, sets nodePath. Not wired to any UI this session (Layers panel is session 10) but reserved so the inspector can call it.

This keeps the current "click a clip to edit the node you care about" story working. Direct node selection lands when the Layers panel does.

### Inspector

```tsx
// apps/studio/src/features/inspector/Inspector.tsx
// existing Switch: KeyframeSelection > ClipSelection > fallback
// new Match: NodeSelection > ClipSelection > KeyframeSelection > fallback

<Switch fallback={<EmptyPanel />}>
  <Match when={keyframeSelection()} keyed>{(s) => <KeyframePanel selection={s} />}</Match>
  <Match when={nodeSelection()} keyed>{(s) => <NodePanel selection={s} />}</Match>
  <Match when={clipSelection()} keyed>{(s) => <ClipPanel selection={s} />}</Match>
</Switch>
```

`nodeSelection()` walks `scene.layers` by `nodePath` and returns `{ node, nodePath }` — scene is read via `useProject().bundle()?.scene`. Keyframe takes precedence over node so that an editing keyframe doesn't flip the panel to the node on every time-drag.

`<NodePanel>` renders:
- Node summary: name, type (Rect / Box / Group / Layer2D / Layer3D), path.
- **2D transform:** 6 `NumberInput`s — x, y, rotation (radians, labeled "rad"), scaleX, scaleY, opacity.
- **3D transform:** 3 `Vec3Input`s + 1 `NumberInput` — position, rotation (radians), scale, opacity.
- Each input's current value reads through `getOverride(nodePath, property) ?? node.transform[...].get()` so the UI shows the effective base value (overlay if present, scene factory value if not). Edits call `setOverride`.

`<NumberInput>` is a thin wrapper around `<input type="number">` with step / min / max / debounced `onInput`. Committed value on blur + Enter; no commit while the user is typing a partial number (handles typing `-0.1` without ripping the leading zero). Implementation: local signal + on-commit handler; no external input library needed.

`<Vec3Input>` renders three `<NumberInput>` side by side, updating the vec as a whole on each commit.

**Accessibility / style:** number inputs get the same `label`/`value` pairing as the existing `<Row>`. Styling lives in `styles.css` under a new `.inspector__input` class, inheriting aquamarine focus-ring from the current token set (per `feedback_kutkut_visual_preferences.md`). Labels use the 12 px `.label` tier; numeric values use the 14 px body tier; keep the existing timecode-style monospace for value readouts (16–18 px tier).

### Testability

Automated:
- `packages/engine/src/overlay/apply.test.ts` — applyOverlay writes scalars and vec3s through `findNodeByPath`; unresolved path is a silent no-op; value shape mismatch is a silent no-op (schema guards before this, so the test is defence-in-depth).
- `packages/engine/src/overlay/schema.test.ts` (or parse tests alongside apply) — `parseOverlay` accepts empty-overrides documents and rejects malformed `value`.

Manual (per `feedback_ui_verification.md`):
- Start dev server on example project; click `t-x` clip → inspector shows Hero node panel. Type `400` into `transform.x`; preview at `t=4.5` (after the `c-x` clip ends at 4.0) shows Hero at x=400. Within `c-x`'s range the x animation still wins. Reload the page; override persists.
- Set an opacity override on Hero → preview dims outside clip ranges.

### Explicit non-decisions this session

- **Should the inspector collapse overlay vs. keyframe editing into one control?** Not this session. The inspector writes overlay only; the Record Mode toggle that lets the same number input write a keyframe is session 10's call.
- **Should undo/redo cover overlay edits?** Not this session. Revisit when session 10 introduces a second command-producing mutation path; could be one shared history or two.
- **Should we show a visual "has override" badge on edited fields?** Nice polish but not required to ship the feature. Flag for polish session.
- **Should deep-nested groups render as a tree in the inspector?** Not until the Layers panel lands. For now, only the node identified by current selection's `nodePath` is editable.

### Roadmap update

Session 09 ships less than the original roadmap row indicated — the row currently reads _"Overlay state file (new ADR), inspector property editors bound to selection, create/delete nodes, keyframe-record mode"_. We land the ADR, the overlay pipeline, and **transform** inspector editing only. Node create/delete and record mode move to a new session 10 ("scene node create/delete + keyframe record mode"); every existing row from 10 onwards (audio core, audio panel, …) shifts by one the same way session 08's split bumped 09+. **Decision locked at spec approval:** shift by one.

## Tasks

1. [x] **ADR 0006 — scene overlay state file.** Write `plans/decisions/0006-scene-overlay-state.md` covering decision, rationale, load/apply order, conflict rule with timeline, addressing (`nodePath`), why current-state diff over patch log, why separate from `timeline.json`, future extension for node create/delete. Link from this spec. ~20 min.
2. [x] **Engine: overlay submodule + schema + parseOverlay.** Create `packages/engine/src/overlay/{index.ts, schema.ts, parse.ts}`. Export `Overlay`, `OverlayJSON`, `OverrideValue`, `CURRENT_OVERLAY_VERSION`, `parseOverlay`, `deserializeOverlay` from `src/index.ts`. Unit test parseOverlay happy + malformed value. `bun test` + `bun run typecheck` green. ~20 min.
3. [x] **Engine: `applyOverlay` + property resolver refactor.** Lift `resolveProperty` out of `timeline/apply.ts` into a shared internal module; widen to accept vec3 properties. Implement `packages/engine/src/overlay/apply.ts` with tests covering scalar override, vec3 override, unresolved path (no-op), type mismatch (no-op). No regressions in timeline tests. ~25 min.
4. [x] **Plugin: read+write overlay endpoints.** Extend `apps/studio/vite/project-fs.ts`: `readProjectHandler` returns `overlay`; new `POST /__kk/projects/:name/overlay` mirrors the timeline POST (validate via `parseOverlay`, write as `\t`-indented JSON + trailing newline). Extend `lib/plugin-client.ts` with `writeOverlay(name, overlay)`. Manual verify: curl on an empty project returns `overlay: null`; posting a valid body writes the file. ~20 min.
5. [x] **Studio: overlay feature slice.** New `features/overlay/` with provider, store (`setOverride` upsert, `removeOverride`, `getOverride`), debounced persistence hook, `CLAUDE.md`. Wire `<OverlayProvider>` into `App.tsx` inside the `<Show keyed>` block next to `<TimelineProvider>`. `useProject()` exposes the overlay from the bundle; `<OverlayProvider>` receives it as a prop and falls back to empty. `bun run typecheck` + `bun run lint` green. ~20 min.
6. [x] **Preview: apply overlay before timeline.** Add the second `createEffect(() => applyOverlay(scene, overlay))` in `PreviewHost.tsx`, gated on the provider being present. Browser verify: with no overlay file, preview looks identical; after editing a value (once task 7 lands, or via a curl prefill), preview reflects the change outside any clip's window. ~15 min.
7. [x] **Timeline collapse toggle.** Chevron button in `.panel-head` flips a `collapsed` signal; grid height reduces to a header-only strip; `<TimelineResizer>` + `<TimelineBody>` hidden via `<Show>`. Persist `collapsed` and the last non-collapsed height to `localStorage` under `kk:timeline:*`. Small CSS: `.app-timeline__toggle` (chevron rotation on collapsed state), update `--tl-height` wiring to pick between collapsed and user height. Browser verify: toggle shrinks strip; preview grows to fill; reload restores collapsed state; resize-then-collapse-then-expand restores the resized height. ~15 min.
8. [x] **Inspector: `NodePanel` + transform editors.** Extend `TimelineSelection` with `nodePath`; derive on `selectClip` / `selectKeyframe`; add `selectNode(path)`. Build `NumberInput` and `Vec3Input` primitives under `features/inspector/editors/`. Build `NodePanel.tsx` rendering transform editors for 2D and 3D nodes, each wired to `setOverride`/`getOverride`. Inspector `<Switch>` gains the node branch (priority: keyframe > node > clip). Update `features/inspector/CLAUDE.md` to drop the "read-only" language for the node path. Browser verify: click `c-x` clip → inspector shows Hero's 2D transform; edit `x` → preview Hero shifts at t=5 (outside clip); reload → override persists. ~35 min.
9. [x] **Roadmap update + verification sweep.** Edit `plans/overview.md` row 09 to match shipped scope; insert new row 10 (create/delete + record mode); shift subsequent rows by one (audio core 10→11, etc.). Add a scope-split note at the top mirroring session 08's. Run `bun run typecheck`, `bun run lint`, `bun test`. Fill Outcome. ~15 min.

## Non-goals

- **Node create / delete / rename / reparent.** Deferred to the new session 10 — same overlay file, next schema bump or sibling `children` list.
- **Keyframe-record mode.** The "numeric input writes a keyframe instead of an override when the playhead is inside a clip" flow lands with session 10.
- **Non-transform property editors.** Color, layer transforms beyond the built-in numeric tiers, material settings — all deferred. The number / vec3 input primitives landing here are the foundation, but we only wire them to transforms this session.
- **Layers tree panel.** Session 10 territory. Selection flows through clips only this session.
- **Undo/redo for overlay edits.** One-shot writes; no history stack. Revisit in session 10 when we have two command-producing paths.
- **Visual "has override" badge.** Nice polish but not essential to ship the feature.
- **Hand-editing `overlay.json` while the studio is running.** Same caveat as `timeline.json` — external edits get clobbered by the next debounced save.
- **Migrations.** `CURRENT_OVERLAY_VERSION = 1`; no prior version exists to migrate from.
- **Exporting overlay-resolved scene snapshot.** Export pipeline is session 15; it can re-apply overlay + timeline itself.
- **Multi-override per property.** Each `(nodePath, property)` pair has at most one entry. Later features (compositing, presets) might need stacks; not today.

## Verification

- `bun test` green, including new `overlay/apply.test.ts` and parse tests.
- `bun run typecheck`, `bun run lint` green.
- `plans/decisions/0006-scene-overlay-state.md` exists and is linked from this spec.
- `bun run dev` on the example project starts cleanly; preview looks identical to before (no overlay file → empty overrides → zero impact).
- **Inspector edit round-trip:**
  - Click `c-x` clip → inspector flips from clip summary to Hero node panel with transform editors populated from scene factory defaults.
  - Type `500` into `transform.x`'s input; press Enter. Within 300 ms, `projects/example/overlay.json` exists with a single override entry.
  - Seek playhead to t=5.5 (past `c-x`'s 0–4 clip range): preview Hero renders at x=500.
  - Seek playhead to t=2 (inside `c-x`): preview Hero interpolates toward the animated t=2 keyframe (600). Animation wins, as designed.
  - Page reload → override still applied.
- **Unresolved path warning:**
  - Rename `Hero` in `scene.ts` to `Hero2`. Preview no longer shows the x-override at t=5 (path unresolved, silent skip). Console logs one warning. Rename back → override takes effect again without touching `overlay.json`.
- **Removal:**
  - Clear the x input (empty string → commit) removes the override entry. File shrinks within 300 ms. Preview at t=5 returns to scene factory default (200).
- **Schema enforcement:**
  - `curl` a malformed POST body to `/__kk/projects/example/overlay` → 400 with readable detail.
- **Selection / inspector priority:**
  - Click a keyframe → inspector shows keyframe panel, NOT the node panel (keyframe > node).
  - Click empty track space → inspector empty state. `nodePath` cleared.
- **Persistence health:**
  - Rapidly edit the same input → exactly one debounced POST fires per 300 ms quiet window.
  - POST errors (e.g. plugin offline) set `saveError`; UI remains interactive.
- **Timeline collapse:**
  - Clicking the chevron in the timeline header shrinks the strip to the header row only; preview + inspector grow to fill the freed space.
  - Clicking again restores the previous height (including any manual drag-resize that happened before collapse).
  - Reloading the page preserves the collapsed state and the pre-collapse height.
  - The drag handle is not interactable while collapsed.
- `plans/overview.md` reflects the decision about session numbering.
