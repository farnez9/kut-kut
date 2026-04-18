# 0004 — Renderer compositor: per-layer adapters on stacked canvases

**Date:** 2026-04-18
**Status:** accepted

## Context

Session 04 introduces two renderer adapters — PixiJS for 2D layers, Three.js for 3D layers — and a compositor that mounts them inside the studio's preview host. Two questions needed a decision before code:

1. **One shared `GPUDevice` across Pixi and Three, or one device per adapter on stacked canvases?**
2. **One `Renderer` interface that takes a whole `Scene`, or a `LayerRenderer` per `Layer` orchestrated by a compositor?**

## Decisions

1. **Stacked `HTMLCanvasElement`s, one per layer, one renderer instance per layer.** Each adapter initializes its own GPU context. The compositor's job is to create, mount, size, and dispose them in `scene.layers` order.
2. **`LayerRenderer` is the adapter interface. `Compositor` is a separate orchestration type** that depends only on the interface, not on Pixi or Three directly. The default compositor factory dispatches `layer.type` → adapter; tests inject a mock.
3. **Reactivity via Solid `createRoot` + `createEffect` inside each adapter.** No per-frame scene traversal in the engine. Property signals already fire when `applyTimeline` writes through them (session 03); effects mirror signals to display-object fields. Three needs one internal rAF because its renderer has no built-in ticker; Pixi's ticker handles its own redraws.

## Why not a shared `GPUDevice`

- **Fiddly.** Pixi v8 and Three's `WebGPURenderer` both accept an external `GPUDevice`, but their resource-management paths assume ownership. Sharing means hand-coordinating submit queues, bind-group layouts, and swap-chain timing across two libraries that don't know about each other. Small bugs become GPU-device-lost errors that are painful to debug.
- **Premature.** A 10-minute project at 1080p/30fps has modest compositing demands. Two canvases with hardware compositing in the browser is likely fine; we haven't measured a ceiling yet.
- **Reversible.** Nothing in the `LayerRenderer` interface locks us into separate devices. When (if) perf becomes a problem, we can add a `SharedGPUContext` argument to the adapter factories without touching consumers.

Revisit trigger: if profiling in session 14 (export) or 17+ (perf) shows compositing/copy overhead above ~2ms per frame at 1080p, reopen this.

## Why per-layer renderers, not per-scene

- **Clean separation.** A `PixiLayerRenderer` never needs to know what `NodeType.Layer3D` is. A `ThreeLayerRenderer` never sees 2D transforms. Each adapter is small enough to hold in your head.
- **Future kinds.** SVG, canvas-2D debug overlays, or custom renderers slot in as new implementations of `LayerRenderer` without a switch statement growing in one god-object.
- **Testable composition.** The compositor's logic (order, setSize fan-out, reverse-dispose, host wiring) is pure orchestration and can be tested with a mock `LayerRenderer` in `bun test` without touching Pixi or Three — both of which need a real browser GPU context to run.

## Why Solid effects inside the renderer

- **Single source of truth.** Scene properties are already signals. Observing them with `createEffect` is the natural consumer path; re-reading the whole scene tree per frame would duplicate work and risk drift.
- **Drive-by-signal, not drive-by-clock.** The engine has no scene-level tick loop. The studio owns the playback controller; when time advances, `applyTimeline` writes signals; effects fan out to display objects; Pixi's ticker and Three's internal rAF push pixels. One authority per concern.
- **Disposal is mandatory.** Each adapter creates its root in `mount` and disposes it in `dispose`. HMR in the studio (session 05+) relies on this being clean — leaked effects would redraw into stale canvases.

## Consequences

- `packages/engine` gains `pixi.js@^8`, `three`, and `@types/three` as runtime deps. Engine CLAUDE.md already allow-lists these.
- The compositor is engine-owned; the studio just provides the host element and the scene. No studio-side orchestration logic leaks into `@kut-kut/engine`.
- Structural scene mutations (adding/removing nodes between frames) are explicitly out of scope this session — the adapter snapshots the tree at `mount` and only reacts to leaf-property changes. Revisit when the studio ships create/delete flows (session 08).

## When to revisit

- Compositing overhead shows up in perf profiles (see trigger above).
- A renderer kind arrives that genuinely needs co-located resources with another (e.g., a post-processing pass that samples from both Pixi and Three outputs). At that point, either a shared-device design or an explicit compositing canvas with texture copies becomes the right call.
