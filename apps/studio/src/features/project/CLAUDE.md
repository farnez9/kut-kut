# features/project

Owns discovery, selection, and loading of projects from `projects/<name>/`.

## Contract

- `<ProjectProvider>` publishes `{ available, selected, bundle, state, error, select, reload }`. It is the **only** consumer of `listProjects`/`readProject`; other features read from `useProject()`.
- `bundle` is `{ name, scene, timeline }` when `state === "ready"` and a project is selected; otherwise `null`.
- Load sequence (on mount + on `select`):
  1. `listProjects()` → populate `available`.
  2. If query `?project=<name>` is in `available`, pick it; else pick `available[0]`.
  3. In parallel: dynamic `import(/* @vite-ignore */ `/@fs/${absolutePath}/scene.ts`)` and `readProject(name)`.
  4. Call scene factory → `deserializeTimeline` (or empty timeline) → publish bundle.
- Single in-flight load: selection bumps a `generation` counter; stale loads discard their results.
- Selection persists to the URL via `history.replaceState` so HMR restores the same project.

## Why the factory pattern

Per ADR 0003, `scene.ts` default-exports `() => Scene` — not a pre-built Scene. Every mount gets a fresh signal graph, which matters for: (a) project swap (old scene's signals get GC'd cleanly), (b) HMR on `scene.ts`, (c) future undo/redo snapshot replay.

## Why nodePath instead of nodeId in timeline.json

See ADR 0005. Factory-minted `nodeId`s are ephemeral, so `timeline.json` refers to nodes by name path. Sibling uniqueness is enforced by the engine (scene factories throw; `deserialize` runs `assertSceneStructure`).

## Non-scope

- Project creation / deletion / rename UI — filesystem operation only in v1.
- Writing `scene.ts` from GUI — ADR 0003 defers; session 08 introduces an overlay state file.
- Cross-project preview or comparison — one project at a time.
- Watching `timeline.json` for external edits — requires plugin-initiated websocket; deferred until session 07 needs it.
