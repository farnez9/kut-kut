# features/preview

Canvas host for the engine compositor.

## Contract

- `<PreviewHost scene timeline drive?>` is the **only** component that mounts a `Compositor`.
- Lifecycle owned here:
  - `onMount` → `createCompositor(...)` → `compositor.mount()`
  - `ResizeObserver` on the host element → `compositor.setSize(w, h)` + re-drive
  - `createEffect(() => applyTimeline(scene, timeline, playback.time()))` is the single path from time to scene mutations
  - `onCleanup` → disconnect observer, dispose compositor
- `drive(time, width, height)` is the demo-scene escape hatch for things the `NumberTrack` schema can't express yet (Vec3 sub-component animation, resize-dependent positioning). Session 06 replaces the demo with a real project module; `drive` stays as a hook the project can opt into.

## HMR

Vite HMR on `demo-scene.ts` or `PreviewHost.tsx` tears down this component; `onCleanup` disposes the compositor before the replacement mounts. If you add new resources (audio nodes, workers), dispose them here.

## Why the demo scene lives in the studio

The engine is content-agnostic (overview.md product statement; engine CLAUDE.md). Templates don't ship with the engine. The demo scene exists only so session 05 can visually verify the session-04 renderers before session 06 wires up real `projects/<name>/scene.ts` loading.

## Non-scope

- Overlays (selection handles, gizmos, aspect guides) — session 07+.
- Project loading via the Vite dev plugin — session 06.
- Export framing (16:9 / 9:16 presets) — session 15.
