# Session 03 — Engine: timeline + playback clock

**Estimated:** ~2h focused
**Depends on:** Session 02 (scene graph, reactive properties, project schema v1 with `timeline: null`)
**Status:** done
**Links:** `plans/decisions/0001-architecture-choices.md`, `plans/decisions/0002-schema-validator.md`, `packages/engine/CLAUDE.md`

## Goal

End state: the engine has a serializable timeline data model (`Timeline` → `Track` → `Clip` → `Keyframe`), a curated easing-curve set, a pure `evaluateTrack(track, time)` interpolation evaluator, and a Solid-reactive `PlaybackController` with play / pause / seek / restart. Scene properties can be driven from a timeline via `applyTimeline(scene, timeline, time)`. The project schema replaces its `timeline: null` placeholder with the real timeline shape, and session 02's roundtrip tests still pass with realistic timeline payloads. `bun test` covers easing monotonicity, interpolation correctness at keyframe boundaries, out-of-range behavior, clock drift under an injected clock, and seek/play/pause/restart state transitions.

## Design

### Scope decisions locked this session

1. **Number tracks only in v1.** A track drives a single scalar `Property<number>`. Vec3 components (`position`, `rotation`, `scale`) are addressed by three separate scalar tracks in a future session. Keeps the interpolation evaluator trivial and the schema closed; vector interpolation is a well-understood follow-up, not a v1 risk.
2. **Clip-relative keyframe time.** `keyframe.time` is an offset within `[0, clip.end - clip.start]`. Moving a clip does not touch its keyframes. Copy/paste is structural.
3. **Absolute scene time for clips and playback.** Scene time is in **seconds** (same unit as `Scene.meta.duration`). `fps` is presentation metadata only — the clock does not quantize to frames in v1.
4. **Schema stays at v1.** Nothing real has been persisted yet; swapping `timeline: null` for the real shape is an in-place refinement. `migrations.ts` keeps its single v1 passthrough, and `UnknownSchemaVersionError` still covers future bumps. (Rationale captured inline in the migration stub — no new ADR needed.)
5. **PlaybackController uses injectable `now()` and `scheduler`.** Default impls call `performance.now()` and `requestAnimationFrame`, but tests pass in a manual clock. This is the only way to write non-flaky clock tests in `bun test`.

### Module layout (new)

```
packages/engine/src/
└── timeline/
    ├── index.ts
    ├── types.ts                   # Timeline, Track, Clip, Keyframe, TrackTarget shapes
    ├── easing.ts                  # EasingName enum + easings fn map
    ├── evaluate.ts                # evaluateTrack(track, time), evaluateClip(clip, time)
    ├── apply.ts                   # applyTimeline(scene, timeline, time) — sets Properties
    ├── factories.ts               # createTimeline, createTrack, createClip, createKeyframe
    └── playback.ts                # createPlaybackController(...) Solid-reactive
```

Project-side additions:

- `src/project/schema.ts` — add `TimelineSchema` (variant keyed by track kind — single `number` variant for now but shaped as a variant so v2 can add `vec3`/`color`), swap `timeline: null_()` for `TimelineSchema`.
- `src/project/serialize.ts` / `deserialize.ts` — serialize timeline from live Timeline (clips/keyframes are plain data, no signals to unwrap), deserialize validated JSON back into `Timeline`.

### Core shapes

```ts
// src/timeline/types.ts
export const TrackKind = { Number: "number" } as const
export type TrackKind = typeof TrackKind[keyof typeof TrackKind]

export type TrackTarget = { nodeId: string; property: string } // e.g. "transform.x"

export type Keyframe<T> = { time: number; value: T; easing: EasingName }
export type Clip<T>     = { id: string; start: number; end: number; keyframes: Keyframe<T>[] }
export type NumberTrack = { id: string; kind: typeof TrackKind.Number; target: TrackTarget; clips: Clip<number>[] }
export type Track       = NumberTrack
export type Timeline    = { tracks: Track[] }
```

Property paths are dotted strings that address a leaf `Property<number>` on a `Node`: `transform.x`, `transform.opacity`, etc. `apply.ts` resolves them with a tiny dotted-path walker — no runtime validation beyond "property exists and is a `Property<number>`" (silently skip otherwise, track the mismatch in a console warn gated behind an internal debug flag — keeps the hot path cheap without hiding bugs in tests).

### Easing

```ts
// src/timeline/easing.ts
export const EasingName = {
  Linear: "linear",
  EaseInQuad: "ease-in-quad",
  EaseOutQuad: "ease-out-quad",
  EaseInOutQuad: "ease-in-out-quad",
  EaseInCubic: "ease-in-cubic",
  EaseOutCubic: "ease-out-cubic",
  EaseInOutCubic: "ease-in-out-cubic",
  StepHold: "step-hold",
} as const
export type EasingName = typeof EasingName[keyof typeof EasingName]
export type EasingFn = (t: number) => number
export const easings: Record<EasingName, EasingFn>
```

All easings take normalized `t ∈ [0, 1]` and return an eased value in `[0, 1]`. `StepHold` returns 0 for `t < 1`, 1 for `t === 1` (piecewise-constant — holds the start value until the next keyframe).

### Interpolation

```ts
// src/timeline/evaluate.ts
export const evaluateClip = (clip: Clip<number>, timeInClip: number): number | undefined
export const evaluateTrack = (track: Track, sceneTime: number): number | undefined
```

Rules (pin in tests):

- Scene time before a clip's `[start, end)` window: clip returns `undefined`. Track returns the first defined evaluation across its clips, or `undefined` if none match. Overlapping clips are **not** supported in v1 — document as a non-goal; if two clips cover the same instant, behavior is "first clip wins" and test it.
- Inside a clip, before the first keyframe: hold the first keyframe's value. After the last: hold the last.
- Between keyframes `k0` and `k1`: normalize `t = (localTime - k0.time) / (k1.time - k0.time)`, apply `easings[k0.easing](t)`, lerp `k0.value → k1.value`.
- Keyframes are assumed sorted by time at construction (factories sort; schema parse does not — document that authors must keep them sorted, add an assertion in dev builds).

### `applyTimeline`

```ts
// src/timeline/apply.ts
export const applyTimeline = (scene: Scene, timeline: Timeline, time: number): void
```

For each track: evaluate → if defined, resolve `(nodeId, property)` on the scene, call `property.set(value)`. This is the single integration point between timeline and scene reactivity; renderers (session 04) will subscribe to the same properties.

A `findNodeById(scene, id): Node | undefined` helper lives in `src/scene/` (small, general — belongs next to the scene graph, not the timeline).

### PlaybackController

```ts
// src/timeline/playback.ts
export type PlaybackState = "playing" | "paused"

export type PlaybackController = {
  time: Accessor<number>
  state: Accessor<PlaybackState>
  play: () => void
  pause: () => void
  seek: (t: number) => void
  restart: () => void     // seek(0) + play
  dispose: () => void     // cancel scheduled frame
}

export type PlaybackControllerOptions = {
  duration: number
  now?: () => number                          // default: performance.now
  scheduler?: (fn: FrameRequestCallback) =>   // default: requestAnimationFrame / cancelAnimationFrame
    { cancel: () => void }
  onEnd?: "pause" | "loop"                    // default: "pause"
}
```

- On `play`: record `anchorNow = now()`, `anchorTime = time()`. Each scheduled tick sets `time = clamp(anchorTime + (now() - anchorNow) / 1000, 0, duration)`. Drift-free as long as `now()` is monotonic — no accumulated float error.
- On `pause`: cancel scheduled frame, keep `time`.
- On `seek`: set `time`, re-anchor if playing.
- On reaching `duration` with `onEnd: "pause"`: pause at `duration`. With `onEnd: "loop"`: wrap to 0 and keep playing.
- `dispose` is mandatory for test and studio-teardown cleanup.

### Public surface additions to `src/index.ts`

```ts
export {
  // types
  type Timeline, type Track, type NumberTrack, type Clip, type Keyframe, type TrackTarget, TrackKind,
  // factories
  createTimeline, createTrack, createClip, createKeyframe,
  // evaluation
  evaluateTrack, evaluateClip, applyTimeline,
  // easing
  EasingName, easings, type EasingFn,
  // playback
  createPlaybackController, type PlaybackController, type PlaybackState, type PlaybackControllerOptions,
} from "./timeline/index.ts"
```

Project exports update to surface the new timeline JSON types (`TimelineJSON`, `TrackJSON`, `ClipJSON`, `KeyframeJSON`).

## Tasks

1. [ ] Scaffold `src/timeline/` directory with `types.ts`, `easing.ts`, `factories.ts`, plus empty `evaluate.ts` / `apply.ts` / `playback.ts` / `index.ts`. Types and `TrackKind`/`EasingName` `as const` enumerations first, no logic. ~20 min.
2. [ ] Implement `easings` map in `easing.ts`. Unit tests: each easing hits 0 at `t=0` and 1 at `t=1`, monotonicity for quad/cubic variants, `StepHold` piecewise shape. ~15 min.
3. [ ] Implement `evaluateClip` and `evaluateTrack` in `evaluate.ts`. Tests cover before-first / between / after-last / outside-clip / overlapping-clips-first-wins. ~25 min.
4. [ ] Add `findNodeById` in `src/scene/` (+ export), implement `applyTimeline` in `apply.ts`. Test: build a scene, build a timeline driving `transform.x` and `transform.opacity`, call `applyTimeline` at several times, assert `.get()` reflects evaluated values. ~20 min.
5. [ ] Implement `createPlaybackController` with injectable `now` + `scheduler`. Tests use a manual clock + manual scheduler: assert `play → tick → time advances`, `pause → time frozen`, `seek → immediate update + anchor reset`, `restart → seek(0) + playing`, `onEnd: "pause"` clamps, `onEnd: "loop"` wraps, `dispose` cancels pending frame. ~35 min.
6. [ ] Update `src/project/schema.ts` — add `KeyframeSchema`, `ClipSchema`, `TrackSchema` (variant on `kind`, single `number` branch), `TimelineSchema`, swap `timeline: null_()` for `TimelineSchema`. Extend `serialize.ts` / `deserialize.ts` to pass timeline through (plain data — no signal wrapping needed). ~20 min.
7. [ ] Extend `project-roundtrip.test.ts` with a non-trivial timeline (multiple tracks, multiple clips, varied easings) and assert deep-equality after `serialize → deserialize → serialize`. Invalid timeline payloads (unsorted keyframes are allowed; missing `target.nodeId` is not) throw with a useful path. ~15 min.
8. [ ] Wire new exports through `src/timeline/index.ts` and `src/index.ts`. Run `bun test`, `bun run typecheck`, `bun run lint`. All green. ~10 min.

## Non-goals

- **Vec3 / vector / color / string tracks.** `TrackKind` is a variant on purpose so v2 can add them without breaking v1 consumers — but v1 ships only `number`.
- **Custom / bezier easings.** The enum is closed this session. Cubic-bezier support and a serialized `{ kind: "cubic-bezier", p1, p2 }` shape are a later addition.
- **Overlapping-clip blending / merge semantics.** First-clip-wins with tested coverage is enough for v1. No crossfades.
- **Scene ↔ timeline drag editing.** Authors build timelines programmatically this session; the studio's interactive timeline is session 07.
- **HMR wiring for timeline changes.** Plain module re-evaluation via Vite is fine; dedicated HMR hooks come with the scene.ts story in session 16.
- **Renderer integration.** `applyTimeline` pushes values into `Property.set` — that's the contract. No canvases mount this session; Pixi/Three land in session 04.
- **Persistence to disk.** The Vite project-fs plugin is session 06; serialize/deserialize in-memory only.
- **Undo/redo.** Timeline edits are raw mutations for now; command store is session 08.
- **Frame-quantized playback clock.** `fps` is metadata; the clock is continuous seconds.
- **New ADR.** Design decisions above are session-local and captured inline; no `plans/decisions/` entry this time.

## Verification

- `bun test` passes. New test files minimum: `timeline/easing.test.ts`, `timeline/evaluate.test.ts`, `timeline/apply.test.ts`, `timeline/playback.test.ts`. `project-roundtrip.test.ts` updated.
- `bun run typecheck` clean in `packages/engine`.
- `bun run lint` clean.
- Public surface: the full export list under **Public surface additions** above resolves via `import { ... } from "@kut-kut/engine"` — nothing requires a deep import.
- Manual check: `createPlaybackController({ duration: 5 })` constructed at top level and disposed cleanly does not leak a rAF handle when inspected in DevTools (studio still builds — no new runtime errors at boot).
- Manual check: `deserialize` rejects a timeline with a non-string `nodeId` with a readable path like `timeline.tracks[0].target.nodeId expected string, got number`.
