# features/preview

Canvas host for the engine compositor.

## Contract

- `<PreviewHost scene>` is the **only** component that mounts a `Compositor`.
- Lifecycle owned here:
  - `onMount` → `createCompositor(...)` → `compositor.mount()`
  - `ResizeObserver` on the host element → `compositor.setSize(w, h)`
  - A single `createEffect` tracks `playback.time()` and, on every tick, runs `applyOverlay(scene, useOverlay().overlay)` first and then `applyTimeline(scene, useTimeline().timeline, t)`. Overlay must re-apply each frame so that when the timeline stops writing a property (playhead outside every clip on that property) the static override value remains; otherwise the last animated value would stick. `applyOverlay` is idempotent and fast — writing N overrides on each frame is cheap.
  - `onCleanup` → disconnect observer, dispose compositor

## Project source

`scene` comes from `<ProjectProvider>` via `useProject().bundle()`. The provider loads it by dynamically importing `projects/<name>/scene.ts`. `timeline` is **not** a prop — `PreviewHost` reads the reactive timeline store from `useTimeline()` so live edits (session 07 clip drags, session 08 keyframe mutations) propagate into the preview without remounting. See `features/project/CLAUDE.md` for the load sequence and `features/timeline/CLAUDE.md` for the store ownership.

## HMR

- Editing `scene.ts` of the current project: Vite HMR invalidates the module; `<ProjectProvider>` reloads the bundle; `<Show keyed>` around `<PreviewHost>` remounts it cleanly (old compositor disposed before the new one mounts).
- Editing `PreviewHost.tsx` itself: same — Solid remounts, `onCleanup` disposes first.
- `timeline.json` is not HMR-watched in v1; changes require a page reload or a plugin-driven websocket push (deferred until session 07 needs it).

## Non-scope

- Overlays (selection handles, gizmos, aspect guides) — session 07+.
- Export framing (16:9 / 9:16 presets) — session 15.
- Per-frame author hooks (the old `drive`): removed with session 06. Real projects stay declarative; Vec3 sub-component animation is an engine follow-up (see session 05 outcome).
