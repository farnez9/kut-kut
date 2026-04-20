# Session 06 — Studio: Vite project-fs plugin + project loader

**Estimated:** ~2h focused
**Depends on:** Session 02 (project/scene JSON schema + `serialize`/`deserialize`), Session 03 (`Timeline`), Session 04 (`createCompositor`), Session 05 (`<PreviewHost>` contract, `<PlaybackProvider>`)
**Status:** done
**Links:** `plans/decisions/0001-architecture-choices.md` (decisions 5, 6), `plans/decisions/0003-scene-source-format.md`, `apps/studio/CLAUDE.md`, `apps/studio/src/features/preview/CLAUDE.md`

## Goal

End state: `bun run dev` boots the studio, calls `GET /__kk/projects`, shows the discovered folders under `projects/` in the left sidebar, and loads the first one by default. Selecting a project dynamically imports its `scene.ts`, fetches `timeline.json` from the plugin, and feeds the resulting `{ scene, timeline }` to `<PreviewHost>` in place of the hardcoded demo. A real example project — `projects/example/` with `scene.ts` + `timeline.json` + `assets/.gitkeep` — ships in this session so the happy path has something to render. The Vite dev plugin exposes the four endpoints named in `plans/overview.md` (list / read / write timeline / upload asset); write + upload are implemented on the server side but aren't yet driven by UI — they're session-07 / session-10+ fodder. The demo-scene module is retired.

## Design

### Scope decisions locked this session

1. **Project module contract: TS factory + JSON timeline (per ADR 0003).** `projects/<name>/scene.ts` default-exports a **factory** `() => Scene` so every mount gets a fresh signal graph (important for dispose/remount and future undo). `projects/<name>/timeline.json` holds the serialized `TimelineJSON` validated by the engine's schema validator (ADR 0002). No `defineProject()` helper this session — the factory + JSON pair is the contract. A helper lands in session 16 when authoring conventions firm up.
2. **Plugin endpoint shape (finalized — closes the overview's open question).** All under the `/__kk/` prefix so they can't collide with studio routes:
   - `GET /__kk/projects` → `{ projects: string[] }` (sorted alphabetical, excludes dotfiles, `node_modules`, and any entry without a readable `scene.ts`).
   - `GET /__kk/projects/:name` → `{ name, timeline: TimelineJSON | null, assets: { path: string; size: number }[] }`. `timeline: null` when the file is absent — the client synthesizes an empty timeline (no tracks). Assets are relative to `projects/:name/assets/` and walked one directory deep.
   - `POST /__kk/projects/:name/timeline` with body `{ timeline: TimelineJSON }` → writes `timeline.json` (pretty-printed, `\n` terminator). Validates the body through the engine schema before writing; 400 on validation failure. Returns `{ ok: true }`.
   - `POST /__kk/projects/:name/assets` (multipart/form-data, single `file` field) → writes `projects/:name/assets/<original-filename>` (sanitized: basename only, reject `..`, strip anything outside `[A-Za-z0-9._-]`). Returns `{ path, size }`. Write endpoint exists so session 10/11 can drop audio into projects; no UI calls it this session.
3. **Path safety is non-negotiable even for a dev-only plugin.** Project names validated with `/^[a-z0-9][a-z0-9-_]*$/i`. Paths built with `path.join` then asserted to live under the project's `projects/<name>/` root via `path.relative` + no leading `..`. Rejected paths return 400 with a JSON error body. Reason: the user likely has other repos in neighbouring dirs; a stray `../` on a malformed URL must not escape the projects root.
4. **Plugin lives at `apps/studio/vite/project-fs.ts`.** Exports `projectFsPlugin(options?: { projectsDir?: string })` returning a Vite `Plugin`. Default `projectsDir` is resolved from `config.root`: `path.resolve(config.root, "../../projects")` (studio root is `apps/studio/`). Uses `configureServer(server)` + `server.middlewares.use("/__kk", …)` with a hand-rolled router (3 routes; too small to pull a library in). Body parsing: `express.json()` equivalent inlined (`readBody(req) → Buffer`, `JSON.parse` for JSON routes, `busboy` for multipart). `busboy` is 1 kb deps, zero transitives — justified.
5. **Projects served to the browser via `server.fs.allow`, not the plugin.** `projects/` sits above `apps/studio/`. Vite's default `fs.allow` scope is the Vite root. We add `path.resolve(config.root, "../../projects")` to `config.server.fs.allow` during the plugin's `config` hook. The browser then does `await import(/* @vite-ignore */ \`/@fs/\${absolutePath}/scene.ts\`)` via a URL the plugin returns. Why `/@fs/`: it's Vite's documented mechanism for serving files outside the root, goes through Vite's TS transform, and preserves HMR on `scene.ts` edits. The list-projects endpoint returns absolute paths for exactly this reason.
6. **Studio plugin client is a thin fetch wrapper.** `apps/studio/src/lib/plugin-client.ts` exports:
   ```ts
   export type ProjectListing = { name: string; absolutePath: string }
   export type ProjectState = { name: string; timeline: TimelineJSON | null; assets: AssetRef[] }
   export const listProjects: () => Promise<ProjectListing[]>
   export const readProject: (name: string) => Promise<ProjectState>
   export const writeTimeline: (name: string, timeline: TimelineJSON) => Promise<void>
   export const uploadAsset: (name: string, file: File) => Promise<AssetRef>
   ```
   Errors surface as thrown `PluginError` (status, body). No retry, no auth — dev-only. The client is used everywhere in the studio that touches disk; do not `fetch('/__kk/...')` from feature code directly.
7. **Project feature owns loading and selection.** New `apps/studio/src/features/project/`:
   - `context.ts` — `ProjectContext` publishing `{ available, selected, bundle, state }` where `state` is `"loading" | "ready" | "error"` and `bundle` is `{ scene, timeline } | null`.
   - `ProjectProvider.tsx` — at mount, `listProjects()` → set `available`; if non-empty, select the first (or the one in `?project=<name>` query, so HMR-restore works); on selection change, dynamic-import the scene module, `readProject()` the timeline JSON, `deserialize`-equivalent the timeline into a `Timeline`, expose via `bundle`. Strictly one in-flight load — later selections cancel earlier ones (AbortController + generation counter).
   - `ProjectList.tsx` — renders the sidebar list with aquamarine accent on the active item and a subdued state for others.
   - `useProject()` — throws outside provider, matches `usePlayback()` shape.
   - `CLAUDE.md` documenting the load-order invariants (list → select → import scene.ts → fetch timeline → assemble bundle → feed to `<PreviewHost>`; single in-flight load; no direct `fetch` elsewhere).
8. **`PreviewHost` loses its `drive` prop.** Per ADR 0003 and the session-05 follow-up, real project bundles should stay declarative. `drive` was a demo-only escape hatch; removing it keeps the project contract clean. The Vec3 sub-component gap remains an engine follow-up (session 05 flagged it). The example project animates only what `NumberTrack` already supports (2D `transform.rotation`, 2D `transform.x`). The 3D Box stays static in v1 of the example.
9. **Empty-state + error-state are cheap UI, not placeholders.** If `available` is empty: preview region renders a centered aquamarine-accented message ("No projects in `projects/`. Create `projects/<name>/scene.ts` to get started."). If `state === "error"`: show the error message and a Retry button. No toast system yet — inline is enough.
10. **`<App>` composition becomes project-driven.** `App.tsx` stops hardcoding `createDemoScene()`. Order of providers (outer → inner): `<ProjectProvider>` → `<PlaybackProvider duration={bundle().scene.meta.duration}>` → shell. When `bundle` is `null` (loading / empty / error), the `<PlaybackProvider>` is mounted with `duration={0}` and `<PreviewHost>` is not rendered — the preview region renders the state message instead. Keeps exactly one compositor lifecycle rule (session 05's `<PreviewHost>` contract).
11. **Retire `features/preview/demo-scene.ts` at end of session.** Its `drive` hook and shape were session-05 stopgaps; the example project is now the canonical "how projects look." Delete the file and its barrel export. Remove the `drive?` optional prop from `PreviewHost`. `features/preview/CLAUDE.md` updates to reflect the real project flow.

### Module layout (new + changed)

```
apps/studio/
├── vite/
│   └── project-fs.ts                 # NEW — Vite plugin
├── vite.config.ts                    # adds projectFsPlugin() to plugins[]
└── src/
    ├── App.tsx                       # rewired: ProjectProvider + dynamic bundle
    ├── lib/
    │   ├── plugin-client.ts          # NEW — fetch wrapper for /__kk/...
    │   └── index.ts                  # re-export
    └── features/
        ├── project/                  # NEW
        │   ├── context.ts
        │   ├── ProjectProvider.tsx
        │   ├── ProjectList.tsx
        │   ├── index.ts
        │   └── CLAUDE.md
        ├── preview/
        │   ├── PreviewHost.tsx       # drop `drive` prop
        │   ├── CLAUDE.md             # rewrite: real project flow
        │   └── demo-scene.ts         # DELETED
        └── ...
projects/                             # NEW top-level dir
└── example/
    ├── scene.ts                      # export default () => Scene
    ├── timeline.json                 # serialized TimelineJSON
    └── assets/
        └── .gitkeep
```

### Core shapes

```ts
// apps/studio/src/lib/plugin-client.ts
export type ProjectListing = { name: string; absolutePath: string }
export type AssetRef = { path: string; size: number }
export type ProjectState = {
  name: string
  timeline: TimelineJSON | null
  assets: AssetRef[]
}
export class PluginError extends Error {
  constructor(readonly status: number, readonly body: unknown) { super(`plugin ${status}`) }
}
export const listProjects: () => Promise<ProjectListing[]>
export const readProject: (name: string) => Promise<ProjectState>
export const writeTimeline: (name: string, timeline: TimelineJSON) => Promise<void>
export const uploadAsset: (name: string, file: File) => Promise<AssetRef>
```

```ts
// apps/studio/src/features/project/context.ts
export type ProjectBundle = { name: string; scene: Scene; timeline: Timeline }
export type ProjectLoadState = "idle" | "loading" | "ready" | "error"
export type ProjectContextValue = {
  available: Accessor<ProjectListing[]>
  selected: Accessor<string | null>
  bundle: Accessor<ProjectBundle | null>
  state: Accessor<ProjectLoadState>
  error: Accessor<Error | null>
  select: (name: string) => void
  reload: () => void
}
```

```ts
// projects/example/scene.ts — example project contract
import {
  createBox, createLayer2D, createLayer3D, createRect, createScene,
  type Scene,
} from "@kut-kut/engine"

export default (): Scene => {
  const rect = createRect({
    name: "Example Rect",
    transform: { scaleX: 180, scaleY: 180 },
    color: [1, 0.42, 0.1],
  })
  const box = createBox({
    name: "Example Box",
    transform: { position: [0, 0, -3], scale: [1.3, 1.3, 1.3] },
    color: [0.22, 0.62, 1],
  })
  return createScene({
    meta: { name: "example", width: 1920, height: 1080, fps: 30, duration: 4 },
    layers: [
      createLayer2D({ name: "2D", children: [rect] }),
      createLayer3D({ name: "3D", children: [box] }),
    ],
  })
}
```

```json
// projects/example/timeline.json — serialized TimelineJSON (abbrev.)
{
  "tracks": [
    { "target": { "nodePath": ["2D", "Example Rect"], "property": "transform.rotation" },
      "kind": "number",
      "clips": [{
        "start": 0, "end": 4,
        "keyframes": [
          { "time": 0, "value": 0, "easing": "linear" },
          { "time": 4, "value": 6.283185307179586, "easing": "linear" }
        ]
      }]},
    { "target": { "nodePath": ["2D", "Example Rect"], "property": "transform.x" },
      "kind": "number",
      "clips": [{
        "start": 0, "end": 4,
        "keyframes": [
          { "time": 0, "value": -280, "easing": "easeInOutCubic" },
          { "time": 2, "value": 280, "easing": "easeInOutCubic" },
          { "time": 4, "value": -280, "easing": "linear" }
        ]
      }]}
  ]
}
```

> Note: the exact `TrackTargetJSON` shape (`nodeId` vs. `nodePath`) is whichever the engine's schema validator accepts today. `nodeId` is currently in-memory only — since fresh factories mint new ids each mount, timeline JSON must key tracks by stable path/name, not id. If the engine only supports `nodeId`, the session widens the target schema to accept `nodePath` as a first-class alternative and resolves it via `findNodeByPath`. **Verify at task 1 before writing timeline.json** — if the schema is already path-based, no engine change is needed.

### Load sequence

1. `<ProjectProvider>` mounts. `listProjects()` → set `available`.
2. If query `?project=<name>` and name is in available → select it. Else select `available[0]`.
3. On selected name:
   - Set `state="loading"`, bump generation counter, new AbortController.
   - In parallel: `readProject(name)` (timeline + assets) **and** dynamic `import(\`/@fs/\${absolutePath}/scene.ts\`)`.
   - Both settle → if generation still current: call scene factory → `scene = factory()`; deserialize `timeline` (or build empty `createTimeline({ tracks: [] })` if null) → `bundle = { name, scene, timeline }`, `state="ready"`.
   - On error: `state="error"`, `error` set. Retry button calls `reload()`.
4. `<PlaybackProvider>` re-mounts on bundle change (Solid `<Show keyed>` pattern) so `PlaybackController` is torn down + recreated with the new duration. `<PreviewHost>` re-mounts with new scene/timeline (session 05 contract: single cleanup point, no canvas leaks).

### HMR behavior

- Editing `projects/example/scene.ts`: Vite HMR fires on the `/@fs/` module; the dynamic import result changes, `<ProjectProvider>` invalidates the current bundle (via `import.meta.hot?.accept` on the scene URL — registered by the provider), reloads the factory, rebuilds `bundle`. `<PreviewHost>` tears down the old compositor and mounts the new. Caveat: `timeline.json` is not module-watched — edits to it require a manual reload or a plugin-initiated websocket notification (out of scope this session; session 07's timeline UI will write through the plugin, which can broadcast).
- Editing plugin code (`apps/studio/vite/project-fs.ts`): Vite restarts the dev server (plugin-code changes always do); user reloads the browser. Acceptable.

### Public surface

- Engine: no new exports unless the `TrackTarget` widening is needed (see note). If so, add `nodePath?: string[]` to `TrackTargetJSON` and resolve in `applyTimeline` before reading properties. Document in ADR if widening lands.
- Studio: everything internal.

## Tasks

1. [x] **Contract prep.** Read `packages/engine/src/project/` + `packages/engine/src/timeline/` to confirm the `TimelineJSON` + `TrackTargetJSON` shapes. Decide: does a track target `{ nodePath: string[] }` exist, or only `{ nodeId }`? If only `nodeId`, add `nodePath` as an alternative, wire `findNodeByPath` in `applyTimeline` (or its target resolver), and write an ADR stub (`plans/decisions/0005-track-target-by-path.md`) capturing the rationale. Add engine tests for path-based resolution. ~25 min.
2. [x] **Create example project.** `projects/example/scene.ts` (factory returning Scene with 2D Rect + static 3D Box, matching the Core shapes snippet), `projects/example/timeline.json` (rect rotation + x animations, schema-validated), `projects/example/assets/.gitkeep`. Confirm `bun run typecheck` is still happy and (in-repo) `deserialize`+`applyTimeline` would successfully evaluate the JSON against the factory's scene. ~15 min.
3. [x] **Vite dev plugin.** `apps/studio/vite/project-fs.ts` implementing the four endpoints with the path-safety rules, JSON + multipart body parsing, schema validation on POST timeline. Register in `apps/studio/vite.config.ts`; add `projectsDir` to `server.fs.allow`. Add `busboy` dependency to `apps/studio/package.json`. Sanity check with `curl -s http://localhost:5173/__kk/projects`. ~35 min.
4. [x] **Plugin client + errors.** `apps/studio/src/lib/plugin-client.ts` (four methods + `PluginError`), barrel through `lib/index.ts`. ~15 min.
5. [x] **Project feature.** `features/project/{context.ts, ProjectProvider.tsx, ProjectList.tsx, index.ts, CLAUDE.md}`. Load sequence per Design. Selection persists to `?project=` so HMR restores it. Handle empty / error states. ~30 min.
6. [x] **Wire `App.tsx` and retire demo-scene.** Replace `createDemoScene()` with `<ProjectProvider>` + `useProject()`; mount `<PlaybackProvider>` keyed on bundle; render state messages / `<ProjectList>` in left sidebar; drop demo-scene wiring. Delete `features/preview/demo-scene.ts`; remove `drive?` from `PreviewHost` and update `features/preview/CLAUDE.md`. ~20 min.
7. [x] **Verify in browser.** `bun run dev` → studio loads → left sidebar shows "example" → preview renders the example project animating rect rotation + x-travel. Edit `projects/example/scene.ts` (change rect color) → HMR updates preview without a full reload. Manually POST a timeline via curl (dev check) and confirm the file is written. Typecheck + lint: `bun run typecheck`, `bun run lint`. Tests: `bun test` unchanged or +engine tests from task 1. Record findings in Outcome → Surprises. ~15 min.

## Non-goals

- **Timeline UI writing.** The `POST /__kk/projects/:name/timeline` endpoint exists, but no UI calls it. Session 07's interactive timeline is the first consumer.
- **Asset upload UI.** Endpoint exists; audio/image import panels that use it land in sessions 10/11/12.
- **Project creation UI.** Users make new projects by creating folders manually. A "New project…" dialog is session 16+ territory.
- **Delete / rename projects.** Out of scope; rare enough to do via the filesystem.
- **Live timeline.json reload.** HMR re-imports scene.ts but does not watch timeline.json. Add a websocket push if/when session 07 needs it.
- **Scene-graph editing / persistence to scene.ts.** ADR 0003 explicitly defers GUI→scene.ts writes; session 08 introduces an overlay state file, not mutation of scene.ts.
- **Multi-project preview.** Only one project at a time is loaded. Switching swaps the compositor; no cross-project comparisons.
- **Server-side caching or filesystem watching for the project list.** Dev tool; `listProjects()` rescans on demand. The UI re-fetches on user action, not on timers.
- **Authentication on plugin endpoints.** Dev-only; binds to localhost by Vite default. Not a concern per ADR 0001.
- **Keyboard shortcut for switching projects.** Nice-to-have for session 08's shortcut registry, not now.
- **Bun-test coverage for UI components.** Per memory (`feedback_ui_verification.md`), UI correctness is verified manually. Plugin + client get minimal `bun test` coverage only if task 1's engine widening needs regression tests — no new UI test files.

## Verification

- `bun run dev` starts without errors. Browser loads the studio.
- **Left sidebar:** "example" appears in the project list with aquamarine accent as the active selection.
- **Preview region:** the 2D Rect animates (rotation + x-travel) as described in the example timeline; the 3D Box sits static behind it. No console errors, no leaked canvases.
- **Playback controls:** timecode readout reflects the example project's 4s duration; Space + Home still work (session 05 hotkeys unchanged).
- **HMR on `scene.ts`:** change the rect's color literal in `projects/example/scene.ts`; preview updates without a full-page reload, preview keeps its current playback time (or resets to 0 — acceptable either way, note which in Outcome).
- **Plugin endpoints (manual curl):**
  - `curl -s http://localhost:5173/__kk/projects` returns `{"projects":[{"name":"example","absolutePath":"..."}]}`.
  - `curl -s http://localhost:5173/__kk/projects/example` returns the timeline JSON + assets array.
  - `curl -s -X POST -H 'content-type: application/json' -d '{"timeline":{"tracks":[]}}' http://localhost:5173/__kk/projects/example/timeline` returns `{"ok":true}`; `projects/example/timeline.json` is now `{"tracks":[]}`. Revert by restoring the committed content.
- **Path-traversal defense:** `curl -s http://localhost:5173/__kk/projects/../../../etc/passwd` returns a 400 error body, not a file.
- **Empty-state:** rename `projects/example/` temporarily → preview shows the "No projects" message; rename back.
- `bun run typecheck` clean across workspace.
- `bun run lint` clean.
- `bun test` green (+ any engine tests added in task 1).
- **Manual check:** verify `server.fs.allow` widening works — DevTools Network tab shows the scene.ts fetched via `/@fs/...` and served as TS with source maps.
