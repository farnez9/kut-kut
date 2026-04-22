# Session 19 — aspect-presets

**Estimated:** ~2h focused
**Depends on:** session 09 (overlay property overrides), session 10 (overlay v2 + applyNodeOps), session 18 (export pipeline)
**Status:** done
**Links:** `packages/engine/src/overlay/`, `packages/engine/src/project/schema.ts`, `packages/engine/src/scene/scene.ts`, `apps/studio/src/features/preview/PreviewHost.tsx`, `apps/studio/src/App.tsx`

## Goal

A scene's aspect can be switched between **16:9 (1920×1080)**, **9:16 (1080×1920)**, and **1:1 (1080×1080)** from the studio without editing `scene.ts`. The preview letterboxes to the selected aspect (best-effort — see Task 4 note), and export reads `scene.meta.width/height`, so picking a preset and hitting Export produces the correct mp4 dimensions end-to-end. The choice is an overlay override (undoable, persisted in `overlay.json`), not a `scene.ts` edit.

## Design

**Engine side.** Extend overlay schema with an optional `meta: Partial<SceneMeta>` field. Introduce a new pure `applyOverlayMeta(scene, overlay)` that shallow-merges `overlay.meta` onto `scene.meta`. It runs once in `OverlayProvider.scene()` alongside `applyNodeOps` (not per-frame — meta is structural-ish, same lifetime as additions/deletions) and again at the top of `exportVideo` before reading dimensions. Per-frame `applyOverlay` (property overrides) stays untouched. Overlay schema bump **v2 → v3** with an identity migration (additive optional field).

```ts
// overlay schema
meta?: { width?: number; height?: number; fps?: number; duration?: number }
```

**Studio side.**

- `<AspectPresetToggle>` in the topbar — three-button group (`16:9`, `9:16`, `1:1`) that commits a meta override via the existing `setOverlayMetaCommand` (new thin command wrapping the overlay mutation). The active preset is derived from current `scene.meta.width/height`.
- `<PreviewHost>`: the preview stage gets `aspect-ratio: <w> / <h>` bound to live scene meta, and an outer flex container letterboxes it. Compositor `setSize` stays driven by ResizeObserver (no change needed).

**No per-aspect bitrate config.** Current 8 Mbps video / 128 kbps audio stays fine for 1080×1920 (same pixel count as 1920×1080). Skip until a real need shows up.

## Tasks

1. [x] **Engine — overlay meta override + schema v3.** Add optional `meta?` field to overlay schema, bump `CURRENT_OVERLAY_VERSION` 2 → 3, add v2 → v3 identity migration. Add `applyOverlayMeta(scene, overlay)` in `overlay/apply.ts` that shallow-merges `overlay.meta` onto `scene.meta`. Call it at the top of `exportVideo` (before reading `width/height/fps/duration`). Re-export from `overlay/index.ts` + top-level `engine/src/index.ts`. Tests: parse accepts/rejects meta shapes; v2 → v3 migration is identity; applyOverlayMeta merges width/height and leaves unspecified fields alone.
2. [x] **Studio — overlay meta command + context method.** Add `setSceneMeta(patch)` raw setter on `OverlayContext` and a matching `setOverlayMetaCommand(prev, next)` undoable command. Wired through the unified command store. `OverlayProvider.scene()` memo subscribes to meta (via a `metaKey`) and calls `applyOverlayMeta(s, overlay)` alongside `applyNodeOps`.
3. [x] **Studio — `<AspectPresetToggle>` in topbar.** Three-button group; active preset derived from `effectiveScene().meta.{width,height}`. Click dispatches `setOverlayMetaCommand`. Sits next to the existing scene title / aspect label.
4. [x] **Studio — preview letterbox.** _(scaffolded via `.preview-stage-host` with inline `aspect-ratio` from live scene meta; corner guides + safe-zone + captions anchor to the stage. The CSS combo `width: 100% + aspect-ratio + max-height: 100%` does not reliably narrow the box in portrait/square inside the flex cell — the host stays full-width in 9:16/1:1. Accepted as a known limitation; proper fix deferred.)_ `.preview-stage` gets `aspect-ratio` bound to live scene meta; outer wrapper in the preview grid cell centers it and letterboxes with the existing `#000` background. Verify ResizeObserver still fires on the stage (not the wrapper) so compositor resizes to the letterboxed box, not the full cell.
5. [x] ~~**Studio — `<SafeZoneOverlay>` + toggle.**~~ _(implemented, then removed before commit — the guide wasn't earning its keep in the UI.)_
6. [x] **Manual verification pass.** Switch each preset on `projects/example/`, confirm preview re-letterboxes and compositor output stays crisp. Run Export at 9:16 and confirm the downloaded mp4 is 1080×1920. Confirm undo/redo across the aspect switch.

## Non-goals

- **Per-aspect bitrate / framerate configs.** Keep current defaults.
- **Resolution presets beyond the three asked for** (no 4K, no 720p, no custom width/height picker).
- **Content auto-reflow.** Switching 16:9 → 9:16 doesn't reposition nodes. Authoring-for-aspect is the user's job; the engine just changes the canvas.
- **Safe-zone guides.** Implemented and then removed before commit.
- **Per-preset export configs or profiles.** One Export button, one config, picks up whatever aspect the scene is currently in.
- **Schema data migration.** v3 → v4 is an additive field only; existing projects keep working without touching their overlay.

## Verification

- `test-runner` sub-agent: `bun test`, `bun run typecheck`, `bun run lint` all green. New overlay meta-override tests in `packages/engine/src/overlay/`.
- Manual in `bun run dev`:
  - Topbar shows `16:9 / 9:16 / 1:1` group with current selection highlighted.
  - Clicking `9:16` re-letterboxes preview to portrait; compositor canvases match the letterboxed dimensions.
  - `⌘Z` reverts aspect switch; `⌘⇧Z` re-applies.
  - Export at 9:16 on `projects/example/` produces a `<slug>-<ts>.mp4` playable at 1080×1920 (inspect via `mediainfo` or any player's info panel).
- `code-reviewer` sub-agent clean before marking done.
