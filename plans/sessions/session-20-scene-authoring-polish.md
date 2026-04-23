# Session 20 — scene-authoring-polish

**Estimated:** ~2h focused
**Depends on:** sessions 01–19 (engine, studio shell, ProjectProvider, overlay, timeline)
**Status:** done
**Links:** ADR 0003 (scene-source-format), ADR 0005 (track-target-by-path), `apps/studio/src/features/project/CLAUDE.md`, `apps/studio/src/features/project/ProjectProvider.tsx`

## Goal

Code-first scene authoring is real, not aspirational: editing `projects/<name>/scene.ts` hot-swaps the preview without a full page reload (playback state, decoded audio buffers, and undo history survive). Authors have a `projects/CLAUDE.md` documenting the factory pattern, ID-stability rule, and HMR semantics. The existing engine factory surface stays as-is — this session is studio + docs polish, not new engine API.

## Design

**Thin by design.** Two concrete deliverables; no new engine module.

- **HMR.** A tiny Vite plugin (`apps/studio/vite/scene-hmr.ts`) injects an `import.meta.hot.accept(...)` stub into every `projects/*/scene.ts`; the stub dispatches a `kk:scene-hmr` CustomEvent carrying the new module + `import.meta.url`. `<ProjectProvider>` exposes a `liveFactory` signal — the bundle's `factory` is a stable wrapper that delegates to it — and listens for the event, calling `setLiveFactory(next.default)` when the URL pathname matches the active project. Because `bundle` identity is unchanged, `<Show keyed>` doesn't remount the subtree; `OverlayProvider`'s `scene` memo (which calls `props.factory()` inside `createMemo`) re-runs because the wrapper reads `liveFactory()` reactively, so `<KeyedPreviewHost>` disposes + remounts the compositor cleanly while playback, audio buffers, and undo history all survive.
- **Docs.** New `projects/CLAUDE.md` covering: factory contract (`() => Scene`, called fresh on each mount), ID-stability rule (timeline/overlay reference nodes by name path — renaming a node breaks references; deleting requires overlay cleanup), HMR semantics (what survives, what doesn't, when a full reload is still needed), asset path convention. Update `features/project/CLAUDE.md` to remove the aspirational HMR sentence and link out.

**Out-of-scope (no engine API additions):** No new primitives, no new factory helpers, no `defineScene()` wrapper. Surface stays at the current `createScene` / `createLayer*` / `createGroup` / `createRect` / `createBox` set.

## Tasks

1. [x] **Verify current HMR behavior.** Confirm there is no `import.meta.hot.accept` for `scene.ts` in the studio today, so a `scene.ts` edit triggers a full Vite page reload (losing playback state, decoded audio, undo history).
2. [x] **Wire scene.ts HMR in `<ProjectProvider>`.** Add a `liveFactory` signal; the bundle's `factory` field becomes a stable wrapper that returns `liveFactory()(...)`. A small Vite plugin (`apps/studio/vite/scene-hmr.ts`) appends `import.meta.hot.accept((next) => window.dispatchEvent(new CustomEvent("kk:scene-hmr", { detail: { url: import.meta.url, module: next } })))` to every `projects/*/scene.ts`. ProjectProvider's `onMount` listens for the event and, when the URL pathname matches the active project's `scene.ts`, calls `setLiveFactory(next.default)`. The bundle reference itself doesn't change, so `<Show keyed>` doesn't remount the subtree.
3. [x] **Confirm overlay rebuild still works after HMR.** `<OverlayProvider>` rebuilds the live scene via `applyNodeOps(factory, overlay)`. Verify it picks up the new `bundle.factory` reference (signal). If not, route the factory through a signal or trigger an explicit overlay-store ping.
4. [x] **Author `projects/CLAUDE.md`.** Sections: *Layout* (`scene.ts` + `timeline.json` + `overlay.json` + `assets/`), *Factory contract* (default-export `() => Scene`, fresh signal graph per mount, why), *Naming & paths* (sibling uniqueness, renaming breaks `timeline.json` / `overlay.json`, layer names matter too), *HMR semantics* (scene factory hot-swaps; timeline/overlay/audio buffers/undo survive; first edit after a project switch may still cold-reload), *Assets* (drop into `assets/`, reference relative paths from scene code if needed). Keep under 80 lines.
5. [x] **Update `apps/studio/src/features/project/CLAUDE.md`.** Replace the speculative HMR bullet with a one-line link to `projects/CLAUDE.md`'s HMR section. Add a short sentence to the load-sequence note describing the HMR path.
6. [x] **Smoke-test the example scene.** Open `example/`, play timeline, edit a color in `scene.ts`, confirm preview updates without losing playback time or undo stack.

## Non-goals

- Additional starter projects — `projects/example/` is the only shipped scene; documenting the pattern is enough.
- New engine factories, primitives (Text, Image, Sphere, …), or a `defineScene` DSL.
- Writing `scene.ts` from the GUI — ADR 0003 still defers this.
- Per-asset import helpers (e.g., `loadImage("foo.png")`) — no primitive consumes them yet.
- HMR for `timeline.json` / `overlay.json` external edits — those are studio-owned files; external-edit watching is its own session.
- Surviving an HMR that *renames* an existing node (the new factory will produce a different scene whose nodes don't match overlay paths — out-of-scope; document the gotcha in `projects/CLAUDE.md`).

## Verification

- **Manual.** `bun run dev`, open `example/`, hit Space to play, edit a Box color in `projects/example/scene.ts`, save: preview updates in place, playback continues, no full reload (DevTools Network tab shows no document fetch). Undo a recent timeline edit afterwards — history is intact.
- **Sub-agent.** `test-runner` for `bun test` + `bun run typecheck` + `bun run lint`.
- **Sub-agent.** `code-reviewer` on the pending diff before close.

---

At wrap-up, append one line summarising what shipped to `plans/overview.md`'s **Progress log** and update the **Current state** paragraph. Do not add an Outcome section here.
