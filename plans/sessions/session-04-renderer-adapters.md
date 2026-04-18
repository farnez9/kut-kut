# Session 04 — Engine: renderer adapters (Pixi + Three)

**Estimated:** ~2h focused
**Depends on:** Session 02 (scene graph, reactive `Property<T>`), Session 03 (live playback mutates properties — renderers must react)
**Status:** done
**Links:** `plans/decisions/0001-architecture-choices.md` (#9 2D+3D from the start), forthcoming `plans/decisions/0004-renderer-compositor.md`, `packages/engine/CLAUDE.md`

## Goal

End state: the engine has a `LayerRenderer` interface, a `PixiLayerRenderer` (2D) and a `ThreeLayerRenderer` (3D), and a `Compositor` that mounts one canvas per layer stacked inside a host element. Each renderer subscribes to Solid property signals so mutations from `applyTimeline` (session 03) or author code propagate to the displayed frame with no extra glue. Two minimal content primitives land — `Rect` (2D) and `Box` (3D) — so the renderers have something visible to draw and so session 02's "content nodes arrive in session 04" follow-up is closed. `bun test` covers the compositor's layer-to-renderer dispatch and reactivity wiring via a mock renderer; the real Pixi/Three canvases are verified visually in session 05 when the studio preview host exists.

## Design

### Scope decisions locked this session

1. **Stacked canvases, one `HTMLCanvasElement` per layer, one renderer instance per layer.** Not a single shared `GPUDevice` across Pixi and Three. This is the realistic v1 per `plans/overview.md` (Open questions → compositor). Shared-device is a future optimization if we hit compositing perf ceilings. Captured in `plans/decisions/0004-renderer-compositor.md`.
2. **WebGPU primary, WebGL fallback.** Pixi v8 auto-negotiates (`preference: "webgpu"`). Three uses `WebGPURenderer` when `navigator.gpu` is present, else `WebGLRenderer`. Both init paths are async — `mount` returns `Promise<void>`.
3. **Per-layer renderer, not per-scene.** A `LayerRenderer` owns one canvas and mirrors one layer. The `Compositor` is the only thing that knows about the whole `Scene`. This keeps each adapter small, avoids having one renderer branch on `NodeType.Layer2D` vs `NodeType.Layer3D`, and leaves room for future renderer kinds (SVG, custom) to slot in without touching the other adapters.
4. **Reactivity via Solid `createRoot` + `createEffect`.** Each `LayerRenderer` creates a root in `mount` and disposes it in `dispose`. Effects mirror property signals to display-object properties (Pixi: `sprite.x = tx.x.get()`; Three: `mesh.position.set(...)`). No manual rAF subscription inside the renderer — Solid's scheduler already batches. The playback clock's per-frame ticks already drive the signals; the renderer just listens.
5. **Content node set this session: `Rect` and `Box`.** Each is a leaf (no children). Rect has a `color: Property<Vec3>` (linear RGB, 0–1) and unit size scaled by its 2D transform. Box has the same `color` and unit dimensions scaled by its 3D transform. These are deliberately minimal so the scene graph extension stays small; richer primitives (Sprite from image, Text, GLTF Mesh) land later.
6. **Scene-graph child typing stays loose.** `Group.children`, `Scene2DLayer.children`, `Scene3DLayer.children` all widen from `Group[]` to `Node[]`. A 2D layer accepting a `Box` child is valid at the type level and silently skipped by the Pixi renderer (with a dev-only console warn). Tightening per-layer content constraints is deferred — it's a naming exercise, not a correctness one.
7. **No `Scene` update loop in the engine.** The renderer is effect-driven; the `Compositor` does not hold a `rAF` loop. The studio's preview host (session 05) owns the playback controller and, through it, drives the clock. Removing a second rAF from the engine keeps drift reasoning simple.

### Module layout (new)

```
packages/engine/src/
├── scene/
│   ├── rect.ts                     # Rect content node + createRect factory
│   ├── box.ts                      # Box content node + createBox factory
│   └── node-type.ts                # adds NodeType.Rect + NodeType.Box
└── render/
    ├── index.ts                    # public barrel
    ├── types.ts                    # LayerRenderer, Compositor, RenderError
    ├── compositor.ts               # createCompositor(...) orchestrates per-layer renderers
    ├── pixi.ts                     # createPixiLayerRenderer(...)
    └── three.ts                    # createThreeLayerRenderer(...)
```

Project-side additions (schema extension):

- `src/project/schema.ts` — add `RectSchema` and `BoxSchema` (literal `type`, nested `Transform2DSchema` / `Transform3DSchema`, `color` as `Vec3Schema`). Extend `GroupSchema.children`, `Layer2DSchema.children`, `Layer3DSchema.children` to accept `Node`-level variants. Introduce a recursive `NodeSchema` variant on `type`.
- `src/project/serialize.ts` / `deserialize.ts` — pass content nodes through. Rect/Box serialize to plain numbers + a 3-tuple color; deserialize reconstructs with `prop(...)`.
- `test/project-roundtrip.test.ts` — add a fixture with a Rect and a Box; assert roundtrip deep-equality.

### Core shapes

```ts
// src/scene/rect.ts
export type Rect = {
  readonly id: string
  readonly type: typeof NodeType.Rect
  name: string
  transform: Transform2D
  color: Property<Vec3>
}

export type CreateRectOptions = {
  id?: string
  name?: string
  transform?: Transform2DInit
  color?: Vec3 // default [1, 1, 1]
}
export const createRect = (options?: CreateRectOptions): Rect
```

```ts
// src/scene/box.ts
export type Box = {
  readonly id: string
  readonly type: typeof NodeType.Box
  name: string
  transform: Transform3D
  color: Property<Vec3>
}

export type CreateBoxOptions = {
  id?: string
  name?: string
  transform?: Transform3DInit
  color?: Vec3 // default [1, 1, 1]
}
export const createBox = (options?: CreateBoxOptions): Box
```

`NodeType` gains `Rect: "rect"` and `Box: "box"`. `Node` widens to `Group | Layer | Rect | Box`. `findNodeById` already recurses over `.children`; widened children fall under the same walk.

### Renderer interface

```ts
// src/render/types.ts
export type LayerRenderer = {
  readonly canvas: HTMLCanvasElement
  /** Async because Pixi Application.init() and Three WebGPURenderer.init() are both async. */
  mount: (host: HTMLElement) => Promise<void>
  setSize: (width: number, height: number) => void
  /** Called on dispose; also tears down the Solid reactivity root created in mount. */
  dispose: () => void
}

export type CreateLayerRendererOptions = {
  layer: Layer
  /** Scene meta for default clear color, aspect, etc. */
  meta: SceneMeta
}

export type Compositor = {
  readonly host: HTMLElement
  /** Mounts one LayerRenderer per layer, in order, appending canvases to `host`. */
  mount: () => Promise<void>
  setSize: (width: number, height: number) => void
  dispose: () => void
}

export type CreateCompositorOptions = {
  host: HTMLElement
  scene: Scene
  /** Injected to keep compositor.test.ts free of Pixi/Three. Default wires real adapters. */
  createLayerRenderer?: (options: CreateLayerRendererOptions) => LayerRenderer
}
```

The compositor's default factory picks the adapter from `layer.type`:

```ts
const defaultFactory = ({ layer, meta }: CreateLayerRendererOptions): LayerRenderer =>
  layer.type === NodeType.Layer2D
    ? createPixiLayerRenderer({ layer, meta })
    : createThreeLayerRenderer({ layer, meta })
```

### Pixi adapter

- `new Application()` + `await app.init({ preference: "webgpu", backgroundAlpha: 0, resolution: devicePixelRatio })`.
- Inside a `createRoot`: walk the layer subtree once to create a `Container` per Group / Layer and a `Graphics` per Rect. Then `createEffect` bindings for each transform field and `color` field so changes stream in without touching the tree structure. Structural changes (adding/removing children) are out of scope this session — the layer tree is assumed static; mutations are leaf properties only. Captured in Non-goals.
- Rect draws a unit square `(-0.5 … 0.5)` with `fill(color)`; transform scale handles sizing. Transform rotation is applied to the container.
- Dispose: call the Solid root dispose, `app.destroy()`, remove canvas from DOM.

### Three adapter

- `navigator.gpu` probe. If present: `new WebGPURenderer()` + `await renderer.init()`. Else: `new WebGLRenderer()` (synchronous).
- Build a `THREE.Scene`, attach an `OrthographicCamera` or `PerspectiveCamera` sized to `meta.width`/`meta.height` with a 2D-style fit; v1 picks **perspective with a fixed fov=45** and positions it at `z = meta.height / (2 * Math.tan(fov/2))` so unit boxes render at roughly unit screen size — keeps the spike simple; camera configurability is a later session.
- Walk the layer subtree under `createRoot`: `THREE.Group` per Group/Layer, `THREE.Mesh(BoxGeometry, MeshStandardMaterial)` per Box. Add one `HemisphereLight` so boxes aren't solid black.
- `createEffect` streams transform fields into `.position`, `.rotation`, `.scale`; `color` into `material.color.setRGB(...)`.
- A single rAF draw callback: the renderer registers one `requestAnimationFrame` loop that calls `renderer.render(scene, camera)` every frame it has pending effect updates. To avoid wasted draws, use a "dirty" flag set inside each effect and cleared after render. `dispose` cancels the rAF and the Solid root, calls `renderer.dispose()`, frees geometries/materials.
- Rationale for the rAF here (but not in the Pixi adapter): Pixi's ticker redraws automatically when scene-graph state changes via its own render loop. Three's renderer has no ticker — explicit `render()` is required. Keeping the rAF inside the renderer means the compositor stays passive.

### Compositor behavior

- `mount` iterates `scene.layers` in order, calls the factory per layer, appends each `canvas` to `host` (stacked absolute-positioned; `host` style is the caller's concern), then awaits all `renderer.mount(host)` calls sequentially to preserve init order (some WebGPU init hits are order-sensitive across the same device).
- `setSize` fan-outs to all child renderers.
- `dispose` fan-outs in reverse order and removes canvases from `host`.

### Public surface additions to `src/index.ts`

```ts
export {
  // content
  type Rect, type CreateRectOptions, createRect,
  type Box,  type CreateBoxOptions,  createBox,
} from "./scene/index.ts"

export {
  // render
  type LayerRenderer, type Compositor,
  type CreateLayerRendererOptions, type CreateCompositorOptions,
  createCompositor,
  createPixiLayerRenderer,
  createThreeLayerRenderer,
} from "./render/index.ts"

// project JSON types
export type { RectJSON, BoxJSON, NodeJSON } from "./project/index.ts"
```

## Tasks

1. [x] Add `pixi.js@^8` and `three` (+ `@types/three`) deps in `packages/engine/package.json`. Write `plans/decisions/0004-renderer-compositor.md` (stacked canvases, per-layer renderer, Solid-effect reactivity — with the rationale). Scaffold empty `src/render/` files and new `src/scene/rect.ts` / `src/scene/box.ts`. ~15 min.
2. [x] Implement `Rect` and `Box` content nodes: types, factories, `NodeType` additions, `Node` union widening, `Group/Layer.children` widening, `src/scene/index.ts` exports. Smoke tests: factories apply defaults, `color.get()` reflects initial, `findNodeById` reaches Rects/Boxes nested under Groups. ~25 min.
3. [x] Extend `src/project/schema.ts` with `RectSchema`, `BoxSchema`, a recursive `NodeSchema` variant, and widened `children` arrays. Update `serialize.ts` / `deserialize.ts`. Extend `test/project-roundtrip.test.ts` with a Rect + Box fixture; invalid `color` payload (e.g. missing third component) throws with readable path. ~25 min.
4. [x] Implement `LayerRenderer` and `Compositor` types in `src/render/types.ts`, plus `createCompositor` in `src/render/compositor.ts` with injectable `createLayerRenderer`. Test `src/render/compositor.test.ts`: a mock renderer records mount/setSize/dispose calls; assert fan-out order, reverse-dispose order, and that `layer.type` → correct mock factory branch. ~25 min.
5. [x] Implement `createPixiLayerRenderer` in `src/render/pixi.ts`. Init, subtree walk, Solid effects for transform + color, dispose. The adapter must compile and export cleanly; **runtime verification is visual in session 05**, not `bun test`. ~25 min.
6. [x] Implement `createThreeLayerRenderer` in `src/render/three.ts`. WebGPU-with-fallback init, subtree walk, dirty-flag rAF render loop, Solid effects, dispose. Same note on verification. ~30 min.
7. [x] Wire exports through `src/render/index.ts` and `src/index.ts`. Run `bun test`, `bun run typecheck`, `bun run lint`. All green. ~10 min.

## Non-goals

- **Structural scene mutations at runtime.** This session handles leaf-property reactivity only (transform fields, color). Adding or removing children between frames is not wired — the layer tree is snapshotted at `mount`. A follow-up session adds structural diffing once the studio has create/delete flows (session 08).
- **Content primitives beyond Rect and Box.** No Sprite-from-image, no Text, no GLTF Mesh, no Line. Each of those is a standalone session-sized piece.
- **Camera/lighting configurability.** Three adapter hardcodes a perspective camera and a single hemisphere light. Exposing cameras and lights as scene nodes is a later session.
- **Shared `GPUDevice` across Pixi and Three.** Each adapter gets its own device. See ADR 0004 for the revisit trigger.
- **Per-layer content-type tightening.** Type-widening children to `Node[]` accepts cross-layer mismatches; renderers silently skip. Tighten later when it hurts.
- **Preview host in the studio.** Session 05 mounts the compositor into the studio's preview region and drives it with `PlaybackController`. This session ships the engine side only.
- **HMR wiring for renderer changes.** Disposal correctness matters (so HMR can swap) but no dedicated HMR hooks are added here.
- **Headless Pixi/Three integration tests.** bun's test env has no `canvas`/`GPUAdapter`; trying to run Pixi/Three in `bun test` costs far more than the signal it provides. Compositor wiring gets a mock-renderer test; the real adapters are verified in the studio preview (session 05).
- **`applyTimeline` inside the renderer.** The renderer only reads properties; it doesn't drive time. The studio owns the playback controller and calls `applyTimeline` from a single place.
- **New project schema version.** Rect/Box are additive variants under the existing `schemaVersion: 1` — same policy as session 03's timeline extension. No `migrations.ts` churn.

## Verification

- `bun test` passes. New/changed files: `test/scene-content.test.ts` (Rect/Box factories, findNodeById reach), `test/project-roundtrip.test.ts` (extended), `test/render/compositor.test.ts` (mock-renderer dispatch, lifecycle).
- `bun run typecheck` clean in `packages/engine`.
- `bun run lint` clean.
- Public surface: `import { createCompositor, createPixiLayerRenderer, createThreeLayerRenderer, createRect, createBox } from "@kut-kut/engine"` resolves with full types.
- `apps/studio` still builds (`bun run build`) — no regression in the workspace.
- Manual check: `deserialize` rejects a Rect payload whose `color` has two components with a readable path like `scene.layers[0].children[0].color expected tuple of 3 numbers`.
- Manual check: `createPixiLayerRenderer({ layer, meta }).dispose()` called immediately after `mount` resolves leaves no `requestAnimationFrame` handles or `PIXI.Application` globals pending in DevTools memory snapshot (sanity — caught here, not enforced in tests).
- Visual verification is **deferred to session 05**, consistent with memory: `feedback_ui_verification.md`. This session's "done" is the type-level contract + mock-renderer tests + clean lint/typecheck, not pixels on screen.

## Outcome

### Shipped

- `packages/engine/src/render/`: `LayerRenderer` / `Compositor` types, `createCompositor` with injectable `createLayerRenderer`, `createPixiLayerRenderer`, `createThreeLayerRenderer`. Canvas is pre-allocated at create time so the compositor can `appendChild` before `mount` resolves.
- Compositor orchestration: sequential mount preserving `scene.layers` order, `setSize` fan-out, reverse-order dispose, idempotent `mount`. Disposed renderers also detach their canvas from the host.
- Pixi 2D adapter (`createPixiLayerRenderer`): `Application.init({ preference: "webgpu", backgroundAlpha: 0, autoDensity, resolution: devicePixelRatio })`. Walks the layer subtree under `createRoot`, attaches `Container` per Group/Layer and `Graphics` per Rect, wires Solid effects for transform (x/y/rotation/scale/opacity) and color (clear + `rect(-0.5,-0.5,1,1).fill({ color: hex })`). Non-2D children silently skipped. Dispose cancels the Solid root and destroys the app without removing the view.
- Three 3D adapter (`createThreeLayerRenderer`): WebGPU primary via dynamic `await import("three/webgpu")` with WebGL fallback (try/catch). `PerspectiveCamera(fov=45)` positioned so unit boxes render near unit screen size; single `HemisphereLight`; one `ThreeGroup` per scene Group/Layer; `Mesh(BoxGeometry, MeshStandardMaterial)` per Box. Internal dirty-flagged rAF loop renders only when an effect fires. Dispose cancels rAF, disposes the Solid root, calls `renderer.dispose()`.
- Scene content primitives `Rect` and `Box`: leaf nodes with `color: Property<Vec3>` and unit size scaled via transform. `NodeType` gains `Rect: "rect"` and `Box: "box"`. `Node` union widens to `Group | Layer | Rect | Box`; `Group.children` and `Layer.children` widen from `Group[]` to `Node[]`. `findNodeById` updated to walk any node that carries `children`.
- Project schema extended: recursive `NodeSchema = variant("type", [GroupSchema, RectSchema, BoxSchema])`, lazily referenced from `GroupSchema.children`, `Layer2DSchema.children`, `Layer3DSchema.children`. Serialize/deserialize handle Rect/Box alongside Group.
- Public surface: `createCompositor`, `createPixiLayerRenderer`, `createThreeLayerRenderer`, `createRect`, `createBox`, plus types (`LayerRenderer`, `Compositor`, `CreateLayerRendererOptions`, `CreateCompositorOptions`, `CreateLayerRenderer`, `Rect`, `Box`, `CreateRectOptions`, `CreateBoxOptions`, `RectJSON`, `BoxJSON`, `NodeJSON`) all exported through `@kut-kut/engine`.
- Tests (55 pass / 356 expects total; 2 new files): `test/scene-content.test.ts` (Rect/Box factories + `findNodeById` reach), `test/render/compositor.test.ts` (mock-renderer fan-out, setSize, reverse-dispose, idempotent mount, per-layer factory dispatch). Roundtrip test extended with a deep Rect and a Box and an invalid truncated-color payload.
- ADR 0004 — renderer compositor choices (stacked canvases, per-layer renderer, Solid-effect reactivity, revisit triggers).
- `bun test` / `bun run typecheck` / `bun run lint` all green across the workspace (studio included).

### Deferred

- **Runtime verification of Pixi/Three rendering.** bun test has no GPU context; `@types/three` and `pixi.js` types compile cleanly, but actual pixels are verified in session 05 once the studio preview host mounts the compositor. Consistent with the "UI verification — let the user check manually" memory.
- **Structural scene mutations** (adding/removing nodes between frames). The adapters snapshot the subtree at `mount`; only leaf properties reach the display objects through effects. Structural diffing arrives when the studio ships create/delete flows in session 08.
- **Content primitives beyond Rect and Box.** Sprite-from-image, Text, GLTF Mesh, Line, etc. are session-sized work, not scope here.
- **Per-layer content-type tightening.** Widened `Node[]` children allow cross-layer mismatches (e.g., a Box under a 2D layer); Pixi silently skips. Tighten when it actually bites.
- **Shared `GPUDevice`.** Each adapter owns its own GPU context. Revisit trigger documented in ADR 0004.
- **Camera and lighting configurability.** Hardcoded perspective + single hemisphere in the Three adapter. Fine for v1.
- **Studio integration.** Session 05 mounts the compositor into the preview host and drives it with `PlaybackController`.

### Surprises

- **Valibot's `variant` rejects `GenericSchema<T>`.** `GroupSchema` was annotated `GenericSchema<GroupJSON>` in session 02 so its self-reference via `lazy(() => GroupSchema)` typechecks. Adding a discriminated `NodeSchema = variant("type", [GroupSchema, RectSchema, BoxSchema])` failed because `variant`'s options need `VariantOption<"type">`, not the generic form. Fix: drop the annotation on `GroupSchema` and route recursion through a dedicated `NodeSchemaLazy: GenericSchema<NodeJSON> = lazy(() => NodeSchema)` used inside both `Group.children` and `Layer.children`. Types flow through cleanly; no casts needed.
- **Three WebGPU lives in a separate build.** `three/webgpu` is a different entry-point that re-exports an entire WebGPU-oriented set of classes. Static-importing it pulls the whole WebGPU pipeline whether or not the browser has `navigator.gpu`. Dynamic `await import("three/webgpu")` inside a `navigator.gpu` probe keeps the WebGL-only path light. `@types/three` exports `./webgpu` correctly, so the type-only `import type { WebGPURenderer } from "three/webgpu"` at the top costs nothing.
- **Pre-allocating the canvas is load-bearing.** The compositor appends `renderer.canvas` to the host *before* awaiting `renderer.mount(host)`. Both Pixi's `Application.init` and Three's renderers accept a `canvas` option — we allocate a `document.createElement("canvas")` synchronously in the factory and hand it to the library at mount time. Tried an "append after mount" variant first; it complicated the compositor and reordered canvases under concurrent mounts.
- **Node union widening broke one existing scene test line.** `layer.children[0]?.children[0]` stopped typechecking because `children[0]` is now `Node | undefined`, and `Node` includes leaf variants without `children`. Fixed by narrowing through the intermediate `Group` reference directly; the semantic assertion is identical.
- **Biome's import-sort fires a lot on new multi-import files.** `bun run lint` was red in six files until `bunx biome check --write .` normalized them. Safe to apply as an autofix; `bun run lint` is still the gate.
- **Task 3 absorbed into task 2** in practice. Widening the scene types forced schema/serialize/deserialize updates in the same pass — couldn't leave typecheck red between tasks. Kept the spec's task list as the historical plan rather than retconning it.

### Follow-ups

- Session 05 mounts `createCompositor({ host, scene, createLayerRenderer })` into the studio's preview region, drives it with the `PlaybackController`, and is the first real visual verification of both adapters. Watch for:
  - `renderer.dispose()` getting called on HMR boundaries so canvases don't leak.
  - Whether the WebGPU path picks up on Chromium / falls back clean on Safari.
  - Whether unit-sized Rect/Box are readable at 1080p or need a starter scale.
- Structural scene mutation hook: the adapter currently snapshots at mount. When the studio lands create/delete flows (session 08), either add a `syncLayer(layer)` reconciliation method to `LayerRenderer` or rebuild on the fly via a `SolidStore`-backed children list. Pick then, not now.
- If a third-party primitive story becomes a goal (e.g., user-defined content nodes in project code), the closed `NodeType` enum plus discriminated `variant` schemas will need a registry pattern. Flag if the built-in primitive count passes ~15 or someone asks.
- `Rect`/`Box` don't expose size as a first-class property yet — transform scale is the only knob. A dedicated `size: Property<Vec2>` (or for Box, `Vec3`) might read more naturally to scene authors once we have a richer studio inspector. Defer until inspector (session 08).
- Consider adding a cheap dev-only warn when a node is silently skipped because its type doesn't match the host renderer (e.g., a Box under a 2D layer). Not worth a flag today; do it once we see the bug in practice.
