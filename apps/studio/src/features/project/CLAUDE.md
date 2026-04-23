# features/project

Owns discovery, selection, and loading of projects from `projects/<name>/`.

## Contract

- `<ProjectProvider>` publishes `{ available, selected, bundle, state, error, select, reload }`. It is the **only** consumer of `listProjects`/`readProject`; other features read from `useProject()`.
- `bundle` is `{ name, scene, factory, timeline, overlay }` when `state === "ready"` and a project is selected; otherwise `null`.
- Load sequence (on mount + on `select`):
  1. `listProjects()` → populate `available`.
  2. If query `?project=<name>` is in `available`, pick it; else pick `available[0]`.
  3. In parallel: dynamic `import(/* @vite-ignore */ `/@fs/${absolutePath}/scene.ts`)` and `readProject(name)`.
  4. Set `liveFactory` to the imported `default`, then call it to produce the initial scene → `deserializeTimeline` → publish bundle with a `factory` field that delegates to `liveFactory()`.
- Single in-flight load: selection bumps a `generation` counter; stale loads discard their results.
- Selection persists to the URL via `history.replaceState` so HMR restores the same project.

## Why the factory pattern

Per ADR 0003, `scene.ts` default-exports `() => Scene` — not a pre-built Scene. Every mount gets a fresh signal graph, which matters for: (a) project swap (old scene's signals get GC'd cleanly), (b) HMR on `scene.ts`, (c) future undo/redo snapshot replay.

## HMR

`apps/studio/vite/scene-hmr.ts` injects `import.meta.hot.accept(...)` into every `projects/*/scene.ts`, dispatching a `kk:scene-hmr` CustomEvent (with the new module + URL) on update. `<ProjectProvider>` listens for it and, when the URL matches the active project, calls `setLiveFactory(next.default)`. The `bundle.factory` wrapper is stable but reads `liveFactory()` on every call — so `<OverlayProvider>`'s scene memo (which calls `props.factory()` inside `createMemo`) re-runs and `KeyedPreviewHost` remounts the compositor cleanly. Playback time, timeline/overlay stores, undo history, and decoded audio buffers all survive because the bundle reference itself is unchanged. See [`projects/CLAUDE.md`](../../../../projects/CLAUDE.md#hmr-semantics) for what does and doesn't propagate.

## Why nodePath instead of nodeId in timeline.json

See ADR 0005. Factory-minted `nodeId`s are ephemeral, so `timeline.json` refers to nodes by name path. Sibling uniqueness is enforced by the engine (scene factories throw; `deserialize` runs `assertSceneStructure`).

## Non-scope

- Project creation / deletion / rename UI — filesystem operation only in v1.
- Writing `scene.ts` from GUI — ADR 0003 defers; session 08 introduces an overlay state file.
- Cross-project preview or comparison — one project at a time.
- Watching `timeline.json` for external edits — requires plugin-initiated websocket; deferred until session 07 needs it.
