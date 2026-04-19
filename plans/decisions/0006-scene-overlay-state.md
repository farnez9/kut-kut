# 0006 — Scene overlay state: `overlay.json` as a property-override layer

**Date:** 2026-04-19
**Status:** accepted
**Context:** session 09 (scene overlay + inspector editing). Resolves the "where do GUI-driven scene edits live?" question deferred from ADR 0003 and surfaced again at the end of session 08.

## Decision

GUI-driven scene edits persist to a new per-project file at `projects/<name>/overlay.json`. The engine applies the overlay **after** the `scene.ts` factory runs and **before** the timeline evaluator each frame. The overlay's v1 payload is a list of **property overrides** addressed by `nodePath` (per ADR 0005). Node create / delete / reparent and non-numeric value types are deferred to later overlay versions.

```ts
// packages/engine/src/overlay/schema.ts
type OverrideValue = number | [number, number, number];

type PropertyOverride = {
  nodePath: string[];
  property: string;          // dotted path, e.g. "transform.x" or "transform.position"
  value: OverrideValue;
};

type OverlayJSON = {
  schemaVersion: 1;
  overrides: PropertyOverride[];
};
```

At most one entry per `(nodePath, property)` pair. An empty overlay is `{ schemaVersion: 1, overrides: [] }`.

## Load / apply order

1. `scene.ts` factory runs → fresh scene with author-declared base values.
2. `applyOverlay(scene, overlay)` walks each override, resolves the node via `findNodeByPath`, writes through the shared property resolver.
3. `applyTimeline(scene, timeline, t)` runs per frame on top. Inside a clip's window the timeline evaluator writes over the overlay; outside, the overlay value sticks.

This preserves the existing "timeline drives each frame" story; the overlay only changes what the scene looks like *before* the timeline has anything to say.

## Rationale

### Why a separate file from `timeline.json`

- `timeline.json` already has a schema-stable, validated shape (`TimelineJSON` + `parseTimeline`). Grafting in overlay state either forces a breaking schema bump or a side-channel field.
- The two payloads have different lifetimes: the timeline is touched every drag; the overlay is touched only when a user edits a property. Keeping the files independent means a hot-loop of timeline edits never invalidates overlay caches (future concern) and hand-editing one doesn't risk corrupting the other.
- Future bundling (export-as-zip in session 15+) can still choose to combine them — the format is internal to the tool, not a user-facing archive.

### Why current-state diff, not a patch log

Two shapes were considered:

| Option | Why not |
|---|---|
| **Patch/event log** (`[{op, path, value, ts}, ...]`, replay on load) | Log grows unboundedly; needs compaction; undo already lives in the studio's in-memory command store (session 08); hand-editing a log is a footgun. |
| **Current-state diff** (chosen) | Idempotent apply; one entry per `(nodePath, property)`; trivially validated; readable diffs in git. |

We already have ephemeral history through the command store. Persisted history (across sessions, across machines) is not a v1 need.

### Why address by `nodePath`

ADR 0005 locks this for timeline targets. Overlay keeps the same convention for the same reason: scene-factory ids are freshly minted on every mount, so id-keyed overlay entries would be unresolvable after any reload. Path-keyed entries survive remounts and are human-editable. Enforcement of sibling name uniqueness (session 02 / ADR 0005) makes paths unambiguous.

### Value type constraint

Overrides are `number | [number, number, number]` in v1. This covers:
- 2D transform scalars (x, y, rotation, scaleX, scaleY, opacity).
- 3D transform vectors (position, rotation, scale) and opacity.

Color (`Vec3`) fits the triple shape — no schema change needed when the inspector grows a colour picker. Other types (strings for caption text, enums, etc.) bump the schema version when they arrive.

### Conflict with timeline tracks

An override for a property that a timeline track animates is **allowed, not an error**. Inside the animated clip, animation wins frame-by-frame; outside, the overlay value is the static baseline. This is the behaviour that falls out of the apply order above; no special handling.

The UX ambiguity — "I typed into the inspector while the playhead was inside an animated clip; did that edit my static baseline or add a keyframe?" — is deferred to **session 10's record-mode toggle**. Until then the inspector writes overlay only. This is predictable (one code path) at the cost of feeling a little lifeless while scrubbed inside a clip.

### Unresolved paths are silent skips, not errors

If an override's `nodePath` doesn't resolve (node renamed or removed from `scene.ts`), `applyOverlay` logs a warning and skips the entry. Matches the timeline's existing silent-skip posture for unresolved targets. A diagnostic panel surfacing these warnings is session-17 polish.

## Consequences

- Engine gains a new public submodule: `@kut-kut/engine/overlay` exporting `Overlay`, `OverlayJSON`, `PropertyOverride`, `OverrideValue`, `CURRENT_OVERLAY_VERSION`, `parseOverlay`, `deserializeOverlay`, `applyOverlay`.
- `resolveProperty` — today private to `timeline/apply.ts` and typed only for `Property<number>` — lifts to a shared internal module and gains a `vec3` branch. Timeline keeps its numeric-only guard at the call site.
- Vite plugin gains a write endpoint: `POST /__kk/projects/:name/overlay`. `GET /__kk/projects/:name` returns `overlay: OverlayJSON | null` alongside the existing `timeline` / `assets` fields.
- Studio `useProject()` bundle gains `overlay`. A new `<OverlayProvider>` feature slice mirrors `<TimelineProvider>`: store + debounced persistence + context.
- `PreviewHost` gets a second `createEffect` that runs `applyOverlay` whenever the overlay store mutates. Sits before the existing `applyTimeline` effect.
- `parseOverlay` throws `ValiError` on invalid input; the plugin endpoint surfaces a 400 with the error detail, matching the timeline endpoint's posture.

## Alternatives considered

- **Extend `timeline.json` with an `overrides` sibling field.** Rejected — different lifetimes, different schemas, breaking schema bump on every payload extension.
- **Write a patch/event log.** Rejected — see above.
- **Regenerate `scene.ts` on GUI edit.** Explicitly forbidden by ADR 0003 — `scene.ts` is author intent, not studio output.
- **In-memory only (no persistence).** Rejected — GUI edits survive reloads today for the timeline; users will expect the same for property edits.
- **Address by `nodeId`.** Rejected per ADR 0005.
- **Allow arbitrary JSON values.** Rejected — drops schema totality; every addition becomes ad-hoc. Numeric-only v1; extend the union explicitly when non-numeric properties become editable.

## When to revisit

- Session 10 adds node create/delete; overlay schema bumps to v2 and migrations kick in.
- Session 10's record mode introduces a second "edit a property value" code path; at that point the inspector must decide per-edit whether it's writing an overlay override or a keyframe. That decision is a UX call, not an overlay-shape call.
- Undo/redo integration across the overlay and the timeline command store — unresolved; flagged for session 10.
- If `overlay.json` grows large enough for JSON parsing to be a noticeable startup cost (~MB scale), revisit compaction / chunking. Unlikely for hand-sized animations.
- If "projects travel between machines" becomes a requirement, the export/import format bundles `scene.ts` compiled output + `timeline.json` + `overlay.json` together.
