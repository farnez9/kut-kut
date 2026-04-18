# Session 02 — Engine: scene graph + project schema

**Estimated:** ~2h focused  
**Depends on:** Session 01 (workspaces green, engine skeleton)  
**Status:** done  
**Links:** `plans/decisions/0001-architecture-choices.md`, forthcoming `plans/decisions/0002-schema-validator.md`, forthcoming `plans/decisions/0003-scene-source-format.md`, `packages/engine/CLAUDE.md`

## Goal

End state: the engine exposes a Solid-reactive scene graph (`Node`, `Group`, `Transform`, `Scene2DLayer`, `Scene3DLayer`) and a versioned project schema with a validated serialize/deserialize roundtrip. Authors build scenes programmatically in TS; the runtime can snapshot a scene to JSON and rebuild it. No renderers, no timeline content — just the data model and its contract. `bun test` has real roundtrip coverage.

## Design

### Open questions this session resolves

1. **Schema validator.** Pick **valibot** (small, tree-shakable, zero runtime deps, good TS inference). Alternative considered: zod. Rationale: engine is publishable, so every kb of runtime dep counts. Capture in `plans/decisions/0002-schema-validator.md`.
2. **Scene source format.** **TS is the primary authoring format** (`projects/<name>/scene.ts` default-exports a `Scene`). JSON is the serialization format the studio/plugin round-trips through disk for *state* (timeline, studio edits), not for authoring. Capture in `plans/decisions/0003-scene-source-format.md`.

### Module layout (new)

```
packages/engine/src/
├── index.ts                       # public surface
├── scene/
│   ├── index.ts
│   ├── node-type.ts               # NodeType `as const` enumeration
│   ├── node.ts                    # Node base: id, type, name, transform, metadata
│   ├── group.ts                   # Group extends Node: children[]
│   ├── transform.ts               # Transform2D / Transform3D shapes + defaults
│   ├── layer.ts                   # Scene2DLayer, Scene3DLayer (both extend Group)
│   └── scene.ts                   # Scene root: layers[], meta (aspect, fps, duration)
├── reactive/
│   ├── index.ts
│   └── property.ts                # prop<T>(initial) → Solid signal + meta for serialization
└── project/
    ├── index.ts
    ├── schema.ts                  # valibot schemas (NodeSchema, SceneSchema, ProjectSchema)
    ├── serialize.ts               # Scene (live) → Project JSON (plain)
    ├── deserialize.ts             # Project JSON → Scene (live, validated)
    └── migrations.ts              # stub: version → current; single v1 for now
```

### Core shapes (names fixed this session; field additions later are fine)

**NodeType is an enumerated constant, not a free-form string.** Use the `as const` pattern rather than TS `enum` — zero runtime overhead beyond a frozen object, tree-shakes cleanly, plays perfectly with valibot's `picklist(Object.values(NodeType))` and discriminated unions. Same DX at call sites (`NodeType.Layer2D`) without the downsides of real `enum`.

```ts
// src/scene/node-type.ts
export const NodeType = {
  Group: "group",
  Layer2D: "layer-2d",
  Layer3D: "layer-3d",
} as const
export type NodeType = typeof NodeType[keyof typeof NodeType]
```

Session 04 extends this with `Sprite`, `Mesh`, `Text`, etc. — same pattern.

```ts
// Transform
Transform2D = { x: Property<number>, y: Property<number>, rotation: Property<number>, scaleX: Property<number>, scaleY: Property<number>, opacity: Property<number> }
Transform3D = { position: Property<[number, number, number]>, rotation: Property<[number, number, number]>, scale: Property<[number, number, number]>, opacity: Property<number> }

// Node (abstract — no one instantiates directly)
Node = { id: string, type: NodeType, name: string, transform: Transform2D | Transform3D }

// Group (holds children)
Group extends Node = { type: NodeType.Group, children: Node[] }

// Layers (scene roots for each renderer)
Scene2DLayer extends Group { type: NodeType.Layer2D }
Scene3DLayer extends Group { type: NodeType.Layer3D }

// Scene (the whole authored scene)
Scene = { meta: { name: string, width: number, height: number, fps: number, duration: number }, layers: (Scene2DLayer | Scene3DLayer)[] }

// Project (the thing that lives on disk as JSON)
Project = { schemaVersion: 1, scene: <serialized Scene>, timeline: null /* filled in session 03 */ }
```

- IDs: `crypto.randomUUID()` by default; callers can pass their own for determinism in tests.

### Reactive properties

A `Property<T>` is a Solid signal with attached metadata so serializer knows what to read without traversing the signal graph:

```ts
type Property<T> = {
  get: Accessor<T>
  set: Setter<T>
  readonly initial: T
}
export function prop<T>(initial: T): Property<T>
```

- Serializer reads `p.get()` to produce the JSON value.
- Deserializer calls `prop(validatedValue)` to reconstruct.
- No framework leakage beyond `solid-js` — that's the peer dep.

### Serialization contract

**Why this exists.** The live scene is a tree of objects whose fields are Solid signals — not JSON-safe. Serialization produces a plain snapshot that can be written to disk (via the session-06 Vite plugin), shipped across `postMessage`, kept in undo history, or deep-compared in tests. Deserialization rebuilds a live tree with fresh signals so UI and renderers can subscribe.

**Why a schema validator at the boundary.** JSON crossing into the engine is untrusted — it may be hand-edited, stale from an older schema version, or corrupted by a studio bug. The validator:

1. Fails fast with structured errors (`scene.layers[0].children[2].transform.x expected number, got null`) instead of letting `NaN` propagate into the renderer.
2. Gives us a single source of TS types — valibot infers them, so no hand-rolled interfaces drift from the schema.
3. Provides the `schemaVersion` gate that routes old payloads through `migrations.ts` when v2 arrives.
4. Is the executable public contract for `@kut-kut/engine` once it goes to npm.

**Contract.**

- `serialize(scene)` → plain JSON-safe object (numbers, strings, arrays, nested). No signals, no class instances.
- `deserialize(json)` → **validates first** with valibot (throws `SchemaError` on failure), then reconstructs live Scene with fresh signals.
- Roundtrip invariant: `deserialize(serialize(scene))` yields structurally equal JSON on re-serialize.

### Public surface (additive to `src/index.ts`)

```ts
export { VERSION } from "./version"
export { Node, Group, Scene2DLayer, Scene3DLayer, Scene, NodeType, createScene } from "./scene"
export { prop, type Property } from "./reactive"
export { serialize, deserialize, type Project, type ProjectJSON, CURRENT_SCHEMA_VERSION } from "./project"
```

(Move `VERSION` into its own file so `src/index.ts` stays a barrel.)

## Tasks

1. [ ] Add `valibot` as a runtime dep in `packages/engine/package.json`; write `plans/decisions/0002-schema-validator.md` (valibot chosen) and `plans/decisions/0003-scene-source-format.md` (TS-primary). ~15 min.
2. [ ] Scaffold `src/scene/` with `node-type.ts` (the `as const` enumeration), `transform.ts`, `node.ts`, `group.ts`, `layer.ts`, `scene.ts`, `index.ts`. Types only first, then minimal factory functions (`createScene`, `createGroup`, `createLayer2D`, `createLayer3D`). ~30 min.
3. [ ] `src/reactive/property.ts` with `prop<T>()` returning `{ get, set, initial }` backed by `createSignal`. Tiny unit test asserting signal behavior + initial preservation. ~15 min.
4. [ ] `src/project/schema.ts` — valibot schemas for Transform2D/3D, Node variants (discriminated union on `type`), Scene, and Project. ~25 min.
5. [ ] `src/project/serialize.ts` + `deserialize.ts` + `migrations.ts` (stub passthrough for v1). Wire `serialize` to read `Property.get()` and `deserialize` to re-wrap with `prop()`. ~25 min.
6. [ ] Tests in `packages/engine/test/`: `scene.test.ts` (build a scene, set a prop, assert signal reacts), `project-roundtrip.test.ts` (serialize → deserialize → re-serialize deep-equal; invalid input throws). ~20 min.
7. [ ] Wire new exports through `src/index.ts`. Run `bun test`, `bun run typecheck`, `bun run lint` — all green. ~10 min.

## Non-goals

- No keyframes, tracks, clips, or playback controller (session 03).
- No renderers, no Pixi/Three install (session 04).
- No concrete content nodes (sprite, mesh, text) beyond the generic `Group` and the two layer types.
- No HMR wiring for `scene.ts` (session 16).
- No disk IO, no Vite plugin (session 06).
- No undo/redo, no command store (session 08).
- No `timeline` payload inside `Project` — leave as `null` with a `TODO: session 03` comment; schema forbids anything else for now.
- No reactive effects beyond raw signals (no `createMemo`, no stores) — keep the primitives minimal.

## Verification

- `bun test` passes, including at least one roundtrip test that serializes a non-trivial scene (nested groups inside both layer types) and asserts deep equality after deserialize+re-serialize.
- `bun run typecheck` clean in `packages/engine`.
- `bun run lint` clean.
- `src/index.ts` exports the names listed above; no deep-import required by consumers.
- Studio still builds (`bun run build`) — session 01 stayed green.
- Manual check: `deserialize({})` and `deserialize({ schemaVersion: 99 })` both throw helpful errors (schema violation / unknown version).

## Outcome

### Shipped
- Scene graph primitives in `packages/engine/src/scene/`: `Node` (union), `Group`, `Scene2DLayer`, `Scene3DLayer`, `Transform2D`/`Transform3D`, `Scene`, with `createGroup` / `createLayer2D` / `createLayer3D` / `createScene` / `createTransform2D` / `createTransform3D` factories.
- `NodeType` and `TransformKind` both as `as const` enumerations — no magic strings at call sites, play cleanly with valibot's `variant` discriminator and tree-shake away at publish.
- Reactive property primitive `prop<T>()` backed by Solid's `createSignal`, exposing `{ get, set, initial }`.
- Valibot schemas (`ProjectSchema`, `SceneSchema`, `LayerSchema` variant, `GroupSchema` recursive via `lazy`, `TransformSchema` variant on `kind`) — single source of TS types via `InferOutput`.
- `serialize` / `deserialize` with structured errors, plus `migrations.migrate` + `UnknownSchemaVersionError` for versioned payloads.
- Tests (11 pass / 27 expects): signal reactivity, factory defaults, nested groups, full roundtrip structural equality, rehydrated signals remain live, invalid payloads throw, unknown `schemaVersion` throws the typed error.
- ADRs 0002 (valibot over zod) and 0003 (TS-primary scene authoring, JSON for runtime state).
- Public surface wired through `src/index.ts`; `VERSION` moved to its own `src/version.ts` so the root stays a barrel.

### Deferred
- Concrete content node types (sprite, mesh, text) — session 04 with renderers, as planned.
- Per-layer content typing (Layer2D-only-holds-2D-transforms) — current `Group.children: Group[]` with free-form transform discriminator is sufficient for v1; tighten when content nodes arrive.
- Dedicated `tsconfig.build.json` for `.d.ts` emit — postponed until we actually publish the engine.

### Surprises
- `tsconfig.json` had `rootDir: "src"` inherited from session 01 scaffolding. Adding `test/**/*` to `include` made tsc complain — dropped `rootDir` / `declaration` / `declarationMap` since `noEmit: true` made them decorative anyway. Publish-time will need its own build config.
- `Vec3 = readonly [number, number, number]` conflicted with valibot's `tuple()` inference (`[number, number, number]` mutable). Readonly doesn't survive JSON roundtrip anyway — dropped.
- Biome's lint sorts named exports (types-before-values, alphabetical within each); `biome format --write` alone doesn't fix this, `biome check --write` does. Fine — `bun run lint` is still the gate.

### Follow-ups
- Session 03 will replace `timeline: null` in `ProjectSchema` with the real timeline shape and write the first migration.
- When content nodes land (session 04), extend `NodeType` and add tightened child-type constraints per layer.
- When publish prep comes up (session 17+), add `tsconfig.build.json` that restores `rootDir: "src"` + `declaration: true` and excludes `test/**`.
