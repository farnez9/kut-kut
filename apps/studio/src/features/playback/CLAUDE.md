# features/playback

Ownership of the `PlaybackController` and everything that drives or reads from it.

## Contract

- `<PlaybackProvider duration={N}>` creates exactly one `PlaybackController` and publishes `{ time, state, duration, play, pause, toggle, restart, seek }` via `PlaybackContext`.
- `usePlayback()` throws outside the provider — no silent no-ops.
- `<PreviewHost>` is the **single writer** on the controller today. It subscribes `playback.time()` and calls `applyTimeline(scene, timeline, t)`. No other component should call `applyTimeline`.
- `<PlaybackControls>` is read-only plus user intent (button click → `toggle` / `restart`).
- `useGlobalPlaybackHotkeys()` wires `Space` → toggle, `Home` → restart. Call once in `App.tsx`, inside the provider. Disposes on cleanup.

## Why a context and not a global store

Session 06 swaps the active project at runtime. When that happens, the provider tears down (old controller disposed in `onCleanup`) and a new one mounts with the new project's duration. A module-level singleton would outlive the project swap and leak its rAF loop.

## Non-scope

- Scrub UI (session 07).
- Multi-track or per-region playback (never — there's one clock).
- Keyframe-record mode (session 08).
