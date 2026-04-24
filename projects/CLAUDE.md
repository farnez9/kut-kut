# projects/

Each subdirectory is one animation. The studio scans `projects/` at boot, lists every directory containing a `scene.ts`, and lets you pick one.

## Layout

```
projects/<name>/
├── scene.ts        # author intent — TypeScript, hand-edited
├── timeline.json   # studio-owned — keyframes/clips/audio/captions
├── overlay.json    # studio-owned — property overrides + structural ops + meta
└── assets/         # audio, images, anything the scene or timeline references
```

The folder name matches `[a-z0-9][a-z0-9._-]*` (enforced by the project-fs plugin) and becomes the project's display name. `timeline.json` and `overlay.json` are created on first GUI write — empty projects only need `scene.ts`.

## Factory contract

`scene.ts` must default-export `() => Scene` (a function, not a pre-built Scene). Per ADR 0003, the studio calls the factory on every project mount so each session gets a fresh signal graph; this matters for clean GC on project swap, HMR (below), and snapshot replay. Authoring helpers all live on the `@kut-kut/engine` public entry: `createScene`, `createLayer2D`, `createLayer3D`, `createGroup`, `createRect`, `createBox`, `createText`, `createCircle`, `createLine`, plus `createTransform2D` / `createTransform3D` if you want to build a transform without going through a node factory.

## Primitives

All primitives take a `transform` (`Transform2D` or `Transform3D`) and reactive properties that can be animated via the timeline:

```ts
createText({
  name: "Label",
  transform: createTransform2D({ x: 0, y: -40 }),
  text: "H₂",
  fontSize: 48,
  color: [1, 1, 1],
  align: "center",                 // "left" | "center" | "right"
});

createCircle({
  name: "Atom",
  transform: createTransform2D({ x: -60, y: 0 }),
  radius: 40,
  color: [0.9, 0.9, 0.95],
  stroke: [0.3, 0.3, 0.35],        // null to disable
  strokeWidth: 2,
});

createLine({
  name: "Bond",
  transform: createTransform2D(),
  points: [[-60, 0, 0], [60, 0, 0]],  // Vec3[] — min 2 points; 2D mount ignores z
  color: [1, 1, 1],
  width: 2,
});
```

`Text`, `Circle`, and `Line` all work under both 2D and 3D layers — pick the transform with `createTransform2D()` or `createTransform3D()`. The 3D Text mount uses `troika-three-text` (SDF glyphs — crisp at any angle); the 3D Line mount uses core Three.js `Line` + `LineBasicMaterial` so `width` is capped to 1px in 3D. **N-point polyline editing is code-only for v1** — the Inspector exposes a two-endpoint editor; longer polylines are authored directly in `scene.ts`.

## Naming & paths

`timeline.json` and `overlay.json` reference scene nodes by **name path** (ADR 0005), e.g. `["2D", "Hero"]`. That means:

- **Sibling names must be unique** — engine factories throw if you nest two children with the same name. `assertSceneStructure` runs at deserialize time too.
- **Renaming a node breaks every track and override that targeted it.** There is no rewrite pass yet (see `features/overlay/CLAUDE.md` non-scope). If you rename, expect to lose those tracks/overrides; the studio doesn't auto-clean.
- **Layer names matter just as much as node names** — the path starts at the layer.

## HMR semantics

Editing `scene.ts` while `bun run dev` is running hot-swaps the scene factory in place. What survives across an edit:

- Playback state (current time, play/pause).
- Timeline + overlay stores and undo history.
- Decoded audio buffers and the audio scheduler.
- The Pixi/Three compositor is disposed and remounted (`KeyedPreviewHost` keys on the live scene), so new geometry shows up immediately.

What does **not** propagate via HMR (still requires a project re-pick or page reload):

- `meta` changes (`width`, `height`, `fps`, `duration`) — these are read at provider mount.
- Renaming a node — the new factory's nodes won't match overlay/timeline paths until those JSON files are also updated.
- The "authored tree" view in the Layers panel — it's the mount-time scene; the preview reflects the new factory but the layers list won't.

## Assets

Drop files into `assets/` and reference them from the studio (file import, audio import, etc.). The dev plugin serves `assets/<file>` via `/@fs/...`; audio extensions are listed in `apps/studio/vite.config.ts` `assetsInclude` so Vite returns raw bytes instead of the SPA fallback. Asset filenames must match `[A-Za-z0-9._-]+`.
