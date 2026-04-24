# Session 21 — primitives-text-circle-line

**Status:** done
**Estimated:** ~2h focused (tight — split to 21a/21b if Pixi+Three mounts both slip)
**Depends on:** sessions 01–20 (engine scene graph, project schema v3, overlay v3, studio layers + inspector)
**Links:** `packages/engine/src/scene/rect.ts`, `packages/engine/src/scene/box.ts`, `packages/engine/src/render/pixi.ts`, `packages/engine/src/render/three.ts`, `packages/engine/src/project/schema.ts`, `apps/studio/src/features/layers/`, `apps/studio/src/features/inspector/`

## Goal

Authors can build educational diagrams end-to-end. Three new leaf primitives — `Text`, `Circle`, `Line` — are registered in the scene graph, render in both the Pixi (2D) and Three (3D) adapters, roundtrip through `project.json` schema v4, survive overlay structural ops, and can be added / edited / animated from the studio Layers panel + Inspector. A minimal chem demo (H–H molecule with bond + labels) proves the authoring flow in code and exports cleanly through the existing WebCodecs pipeline.

## Design

**Thin by design.** One scene node per primitive, with a `Transform2D | Transform3D` (same pattern as `Group`); renderers mount only when the transform kind matches. No new engine modules; each primitive mirrors the `Rect`/`Box` file layout.

- **Scene nodes** — `packages/engine/src/scene/{text,circle,line}.ts`:
  - `Text { name, transform, text, fontSize, fontFamily, color, align }`
  - `Circle { name, transform, radius, color, stroke?, strokeWidth? }` — explicit `radius` (avoids stroke-width distortion under scale)
  - `Line { name, transform, points: Vec3[], color, width }` — `Vec3[]` always; 2D mount ignores `z`, 3D mount uses it. Minimum 2 points; N-point polyline is the same shape.
  - New `NodeType` variants; reactive props via `prop()` like `Rect`.
- **Pixi mounts** — extend `mountNode` in `render/pixi.ts`: `new Text(...)` (anchor 0.5, 0.5), `Graphics.circle(0,0,r).fill(...).stroke(...)`, `Graphics.moveTo/lineTo(...).stroke(...)`. Skip silently when `transform.kind !== "2d"` (match the existing fallback).
- **Three mounts** — extend `mountNode3D` in `render/three.ts`:
  - Text: **troika-three-text** (`Text` class). New runtime dep in `packages/engine/package.json` — justified here because `CanvasTexture` on a `Sprite` degrades at angles and `TextGeometry` needs font-JSON assets. Call `.sync()` + `markDirty()` on reactive change.
  - Circle: `CircleGeometry(radius, 32)` + `MeshBasicMaterial({ color, transparent })` — flat disc in local XY, transform rotation orients it in 3D.
  - Line: `Line` + `LineBasicMaterial` from three core (not `LineGeometry`/`Line2` — avoid the addons bundle for this session; width is capped to 1px but acceptable for v1).
  - Skip silently when `transform.kind !== "3d"`.
- **Schema v4** — `project/schema.ts`: add `TextJSON`, `CircleJSON`, `LineJSON` to the `NodeJSON` union; bump `CURRENT_SCHEMA_VERSION` to 4; `migrateV3ToV4` is a no-op. Overlay `NodeKind` enum extended with `text`, `circle`, `line`; valibot union updated.
- **Studio surface** — Layers panel "Add" menu gets three entries scoped to the selected layer's kind (2D → Pixi-capable, 3D → Three-capable). Inspector gets a `TextInput` (for `text`) and a two-endpoint line editor (xyz per endpoint). N-point polyline editing stays scene.ts-only for v1.

**Out-of-scope:** Arrowhead helper, dashed line styles, LaTeX/MathJax text, image import, 3D sphere, N-point polyline GUI editor. See Session 22 for Image.

## Tasks

1. [x] **Scene nodes.** Create `scene/text.ts`, `scene/circle.ts`, `scene/line.ts` using `scene/rect.ts` as the template. Add `NodeType.Text | Circle | Line`. Export factories + types from `scene/index.ts`. Update the `Node` union in `scene/node.ts`. Wire into `assertUniqueChildNames` checks (already path-based; should Just Work).
2. [x] **Public API.** Export new factories, `Create*Options`, and type aliases from `packages/engine/src/index.ts`. Keep naming consistent with `createRect`/`createBox`.
3. [x] **Project schema v4.** Add `TextJSON`/`CircleJSON`/`LineJSON` to `project/schema.ts`'s discriminated union. Bump `CURRENT_SCHEMA_VERSION` to 4. Add `migrateV3ToV4` (no-op) in `project/migrations.ts`. Extend `serializeScene`/`deserialize` switches.
4. [x] **Pixi mounts.** Extend `mountNode` in `render/pixi.ts` with three cases. Anchor Text at `(0.5, 0.5)`. Circle uses explicit `radius` (not scale). Line rebuilds `Graphics` on `points` change. Each visual prop wrapped in a `createEffect`.
5. [x] **Three mounts + troika dep.** Add `troika-three-text` to `packages/engine/package.json` runtime deps. Extend `mountNode3D` in `render/three.ts` with three cases. Text: `new Text()`, assign `text/fontSize/color/anchorX=center/anchorY=middle`, call `sync()` + `markDirty()` from each `createEffect`. Circle: `CircleGeometry` + `MeshBasicMaterial`. Line: `BufferGeometry.setFromPoints(points.map(p => new Vector3(...p)))` + `LineBasicMaterial`. Added a bundled `troika-three-text.d.ts` shim (referenced via triple-slash from engine index) so studio tsc picks it up without crossing the package boundary.
6. [x] **Overlay + structural ops.** Extend `NodeKind` (valibot union) in `overlay/schema.ts` with `text|circle|line`. Update `overlay/apply-node-ops.ts` so `NodeAddition` of each new kind dispatches to the right factory with the addition's initial properties. `OverrideValueSchema` widened to `number | string | Vec3 | Vec3[]`; the Line inspector stores `points` as a whole-array override (multi-segment paths like `points.0.x` deliberately not resolved).
7. [x] **Layers panel add menu.** In `features/layers/`, add three entries. Default factories: text `"Label"` (fontSize 32, black), circle (radius 50, filled), line (two endpoints at `[-50,0,0]` and `[50,0,0]`, width 2). The entry creates a `NodeAddition` with the selected layer as parent, routed through the existing add-node command so it's undoable + persisted in `overlay.json`.
8. [x] **Inspector editors.** In `features/inspector/`, add a `TextInput` (new or reuse any existing) bound to `text`. Reuse the existing color editor for `color`/`stroke`. `NumberInput` already covers `radius`/`fontSize`/`strokeWidth`/`width`. Add a compact two-endpoint line editor (six number fields for `points[0]`/`points[1]` xyz). N-point editing remains scene.ts-only — document in `projects/CLAUDE.md`.
9. [x] **Authoring guide.** Append to `projects/CLAUDE.md` one example per new primitive (factory call + common props) + a one-liner that N-point lines are authored in code for now.
10. [x] **Chem-demo smoke.** Create `projects/chem-demo/scene.ts` with two circles (H, H), one line (bond), three text labels (H, H, H₂). Keyframe bond width 0 → 2 over 1s and label opacity. **Manual preview + mp4 export not run in this session — verify in browser before relying on it.**
11. [x] **Sub-agents.** `test-runner` for `bun test` + `bun run typecheck` + `bun run lint`; `code-reviewer` on the final diff.

## Non-goals

- **Image import** — Session 22.
- **3D sphere, 3D box-with-texture** — not requested; Three `Box` stays as-is.
- **Arrowhead / triangle primitive** — compose from rotated `Rect` or future `Polygon`. Physics vectors can wait until a real scene hits the limit.
- **Polygon / polyline GUI editor with N points** — two-endpoint line is enough for v1; `scene.ts` covers polylines directly.
- **LaTeX / MathJax text** — revisit when the math domain actually demands it.
- **Dashed / dotted line styles, gradient fills, drop shadows** — v1 is solid fill + solid stroke.
- **HMR for schema migrations** — v3 projects that load under v4 migrate once on parse; no live-reload consideration needed.

## Verification

- **Tests (via `test-runner`).** `bun test` — serialize/deserialize roundtrip for each new node (both 2D and 3D transform variants); `migrateV3ToV4` is a no-op but exercised; overlay `NodeAddition` parses for `text|circle|line`. `bun run typecheck` + `bun run lint` green.
- **Manual.** Open `projects/example`, add a Text + Circle + Line to the 2D layer via Layers panel — confirm each renders in the preview, edit props live in the inspector, undo/redo. Repeat under the 3D layer. Save and reload the project, confirm `overlay.json` persistence.
- **Manual — chem-demo.** `projects/chem-demo/scene.ts` renders in preview, animates the bond + label fade in, and `<ExportButton>` produces an mp4 where text/circle/line are all visible.
- **Sub-agent.** `code-reviewer` on the final diff before close.

---

At wrap-up, append one line to `plans/overview.md`'s **Progress log** and update the **Current state** paragraph. Do not add an Outcome section here.
