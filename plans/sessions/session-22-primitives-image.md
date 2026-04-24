# Session 22 — primitives-image

**Estimated:** ~2h focused
**Depends on:** session 21 (new primitive pattern established), session 13 (asset-upload plugin endpoint)
**Status:** done
**Links:** `packages/engine/src/scene/rect.ts`, `packages/engine/src/render/pixi.ts`, `packages/engine/src/render/three.ts`, `apps/studio/vite/project-fs.ts`, `apps/studio/src/lib/plugin-client.ts` (`uploadAsset` already shared), `packages/engine/src/export/index.ts`

## Goal

Authors can drop an image file into a project from the studio and reference it as a scene node under either a 2D or 3D layer. The primitive renders in live preview and in the WebCodecs export (textures are fully decoded before the first exported frame). This unblocks anatomy (imported illustrations) and is the fastest path for biology cell/organ references.

## Design

**Thin by design.** One scene node, two renderer mounts, one studio ingest flow reusing the asset-upload endpoint already serving audio imports. Schema either stays on v4 (additive) or bumps to v5 with a no-op migration — decide based on whether session 21 extended `NodeJSON` without a version bump (it didn't — v4 exists; this is additive on v4 and needs no bump unless valibot's strict mode rejects).

- **Scene node** — `packages/engine/src/scene/image.ts`:
  - `Image { name, transform, src, width, height, opacity? }`.
  - `src` is a project-relative asset path (`assets/bicep.png`), resolved by the existing project-fs plugin via `/@fs/...` — same mechanism audio imports use.
  - `width`/`height` are explicit (in scene units) — no "intrinsic size" fallback; the inspector prefills from the decoded image on add.
- **Pixi mount** — `Sprite.from(url)` with a ready-flag signal to suppress a flicker on first load; anchor `(0.5, 0.5)` for center-origin parity with `Rect`. Rebuild on `src` change.
- **Three mount** — `Mesh(new PlaneGeometry(1,1), new MeshBasicMaterial({ map: texture, transparent: true }))` with `scale.set(width, height, 1)`. Load via `TextureLoader` with a ready flag; `markDirty()` on load and on reactive change.
- **Studio ingest** — reuse `project-fs`'s existing asset-upload endpoint (currently POSTed to by audio import at `features/audio/ingest.ts`). Extract a shared `uploadAsset(file)` helper if it isn't already shared. Add `<AddImageButton>` in the Layers panel that opens a file picker, uploads, creates the node via an undoable `NodeAddition` pointing at the uploaded relative path, and pre-fills `width`/`height` from the just-decoded `HTMLImageElement`.
- **Export** — textures must be decoded before the first `renderFrame` or the first exported frame will be blank. Add an `awaitReady()` seam on the scene or extend `exportVideo` to await all outstanding `Sprite.from` / `TextureLoader` promises before the encode loop starts. Simplest: track a set of pending load-promises on the compositor and `Promise.all` them before frame 0.

**Out-of-scope:** SVG import (vector, separate mount pattern), animated GIFs / video textures, image filters / tints / masking, drag-and-drop upload (button + file-picker only), asset library UI.

## Tasks

1. [x] **Scene node.** Create `scene/image.ts` mirroring `scene/rect.ts`. Add `NodeType.Image`. Export from `scene/index.ts` and the engine's public `index.ts`.
2. [x] **Project schema.** Add `ImageJSON` to the `NodeJSON` union in `project/schema.ts`. If valibot accepts under v4 (additive), skip migration; otherwise bump to v5 with a no-op migration in `project/migrations.ts`. Extend `serializeScene`/`deserialize`.
3. [x] **Pixi mount.** In `render/pixi.ts`, add `mountImage`: `Sprite.from(src)` with a ready signal. Anchor `(0.5, 0.5)`. Rebuild on `src` change; update `sprite.width`/`height` from the reactive props. Skip when `transform.kind !== "2d"`.
4. [x] **Three mount.** In `render/three.ts`, add `mountImage3D`: `PlaneGeometry(1,1)` + `MeshBasicMaterial({ map, transparent: true })`. Load via `new TextureLoader().loadAsync(url)`. `scale.set(width, height, 1)`. `markDirty()` on load + reactive change. Skip when `transform.kind !== "3d"`.
5. [x] **Overlay `NodeKind`.** Extend valibot union in `overlay/schema.ts` with `image`. Update `overlay/apply-node-ops.ts` so `NodeAddition` of kind `image` dispatches to `createImage` with the addition's initial props.
6. [x] **Shared asset upload.** ~~Extract `uploadAsset(file)` from `features/audio/ingest.ts` into a shared module if it isn't already shared.~~ Already shared: `apps/studio/src/lib/plugin-client.ts` exports `uploadAsset(projectName, file)` and is consumed by `AudioProvider.importFile`. Image flow will reuse it directly.
7. [x] **Studio add flow.** In `features/layers/`, add "Add Image" entry. Opens `<input type="file" accept="image/*">`, on selection: upload via the shared helper, decode via `HTMLImageElement` to read intrinsic dimensions, create a `NodeAddition` with `src`, `width`, `height` prefilled, dispatched through the existing add-node command (undoable, persisted in `overlay.json`).
8. [x] **Inspector editor.** Reuse `NumberInput` for `width`/`height`. Add a read-only `src` display with a "Replace…" button that re-runs the upload flow and patches `src`. No drag-drop.
9. [x] **Export — await textures.** Extend `exportVideo` (or its compositor warm-up) with a "await all outstanding sprite / texture loads" step before the encode loop. Simplest implementation: have the Pixi/Three renderers expose a `ready(): Promise<void>` that resolves when their own pending loads settle; `exportVideo` calls it on every `LayerRenderer` before frame 0.
10. [x] **Authoring guide.** Append to `projects/CLAUDE.md`: image factory example, the `assets/` path convention, the "width/height are explicit, not intrinsic" note.
11. [x] **Anatomy smoke.** Project structure created (`projects/anatomy-demo/{scene.ts,timeline.json,assets/}`). Bicep illustrations are user-supplied — drop `bicep-relaxed.png` and `bicep-flexed.png` into `assets/` to render the cross-fade. Create `projects/anatomy-demo/scene.ts` with a single imported illustration of a bicep (relaxed + flexed states as two `Image` nodes, one hidden, opacity keyframed to cross-fade). Export to mp4 — illustration frames must appear sharp, without missing the first frame.
12. [x] **Sub-agents.** `test-runner` for `bun test` + `bun run typecheck` + `bun run lint`; `code-reviewer` on the final diff.

## Non-goals

- **SVG** — vector import is its own mount/compositing story. If the anatomy demo reveals a strong need, spin up a follow-up session.
- **Animated / video textures** — no `ImageBitmap` cycling, no `VideoElement` sources. Static images only.
- **Filters, tint, mask, blend modes** — v1 is draw-as-is.
- **Drag-and-drop upload** — file-picker button only. Drag-drop can layer on top of the shared uploader later.
- **Asset library panel** — no gallery / browser UI. Pick through the file input each time.
- **Retina-density handling** — Pixi's `resolution` auto-density already covers it; no per-image DPR gymnastics.

## Verification

- **Tests (via `test-runner`).** Serialize/deserialize roundtrip for `Image` under both 2D and 3D transform variants. `bun run typecheck` + `bun run lint` green.
- **Manual.** `bun run dev`, open `projects/example`, click Add Image, pick a PNG from disk, confirm upload → add → render in preview. Inspector width/height edits reflect live. Undo removes the node and (TBD) the uploaded file stays on disk (document as intentional).
- **Manual — export.** Export a project containing at least one `Image` to mp4. The first exported frame must show the image, not a placeholder or blank — this validates the `await textures` step in `exportVideo`.
- **Manual — anatomy-demo.** `projects/anatomy-demo/scene.ts` renders + cross-fades cleanly in preview and in the exported mp4.
- **Sub-agent.** `code-reviewer` on the final diff before close.

---

At wrap-up, append one line to `plans/overview.md`'s **Progress log** and update the **Current state** paragraph. Do not add an Outcome section here.
