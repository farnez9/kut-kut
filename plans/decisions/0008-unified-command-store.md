# 0008 — Unified command store + record-mode routing

**Date:** 2026-04-19
**Status:** accepted
**Context:** session 11 (keyframe record mode + unified undo). Supersedes the per-feature undo stack the timeline introduced in session 08 and plugs the overlay's v2 structural ops (ADR 0007) into the same history.

## Decision

One `CommandStore` instance per project lifetime, owned by a new `<CommandProvider>` that wraps both `<OverlayProvider>` and `<TimelineProvider>`. Every user mutation — clip drag, keyframe drag, property override, node addition, node deletion, node restore, record-mode keyframe write — builds a `Command` and calls `commands.push(cmd)`. `⌘Z` / `⌘⇧Z` act on the single shared stack.

```ts
// apps/studio/src/lib/commands/types.ts
export type Command = {
  label: string;      // short, user-facing; shown in dev tools only for now
  apply: () => void;  // side-effecting; closes over the store(s) it needs
  invert: () => void;
};

// apps/studio/src/lib/commands/store.ts
export type CommandStore = {
  push: (cmd: Command) => void;     // calls cmd.apply(); records; clears future
  undo: () => void;
  redo: () => void;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  clear: () => void;                // on project swap / HMR
};
```

Cap: 200 past entries (same as session 08). `push` after `undo` clears the future. `clear` wipes both stacks and is invoked explicitly when the provider unmounts, so HMR of a `scene.ts` doesn't leave the bus holding commands that close over a dead store.

## Command shape: side-effect, not reducer

Session 08's timeline commands took a `(draft: Timeline)` parameter and the store wrapped them in `produce`. That works because the timeline store lives in one place and has one draftable shape. Once overlay commands join the bus, two different stores with their own `produce` loops push through the same `push`. Signatures that accepted "the store" would couple every command to both surfaces.

Side-effect commands — closures that already know which store to poke — decouple the bus from the store shape. The timeline commands become thin wrappers that call the existing `timeline.moveClip` / `resizeClipLeft` / etc. raw setters. The overlay commands wrap the existing `setOverride` / `addNode` / `deleteNode` / `restoreNode` mutators. The bus is shape-agnostic: it stores `Command` and calls `apply` / `invert`.

Cost: commands now capture references at construction time. That's fine in practice — commands are built at the call site in response to a user action, live for at most 200 stack slots, and the provider clears the bus on project swap.

## What flows through commands

**Yes:**
- Clip move / trim-left / trim-right.
- Keyframe time drag.
- Property override upsert / clear.
- Node addition / deletion / restore.
- Record-mode keyframe upsert.

**No:**
- View state: `view.zoom`, `view.origin`, selection. Purely ephemeral UI.
- Playback state: `time`, `state`. Transport, not an edit.
- Project load, HMR reload. Not user edits.
- Timeline / overlay persistence writes. Downstream of edits, not the edits themselves.

Keeping selection out of the stack means `⌘Z` unwinds a structural change without also flipping which clip is selected — matches how editors like After Effects and Figma behave.

## Record-mode routing rule

A top-bar toggle (`R`, off by default, in-memory only) flips inspector commits between two destinations:

```
if (record.active() && typeof nextValue === "number") {
  const hit = findNumberTrackCoverage(timeline, nodePath, property, playback.time());
  if (hit) {
    push(upsertKeyframeCommand(timeline, hit.trackId, hit.clipId, hit.localTime, hit.prevKeyframe, nextValue));
    return;
  }
}
push(setOverrideCommand(overlay, nodePath, property, prev, nextValue));
```

`findNumberTrackCoverage` scans `timeline.tracks`, matching **by `nodePath` + `property`** per ADR 0005, and returns the first clip that contains the playhead. `localTime = round(playback.time() - clip.start)`. The existing keyframe at that slot (if any) is captured for inversion.

Routing is strictly **coverage-gated**:
- No covering clip → fall back to overlay override. No "auto-create track or clip" — that needs overlay/timeline structural coordination we're not paying for this session.
- Vec3 edits → always fall back. The track schema is `Clip<number>` only; vec3 keyframes aren't representable.
- Non-number, non-vec3 properties → fall back (trivially, since the inspector only edits those two shapes today).

### Why coverage-gated instead of "create a clip if missing"

Auto-creating a clip means auto-creating a track when one doesn't exist, which means picking an `id`, a `target`, and a `start/end` the user didn't specify. Pick wrong and you've dropped a silent gotcha into the user's timeline. Leave it explicit: record mode *writes into* existing animation; creating animation stays a conscious authoring step (Layers panel today; timeline authoring tooling later). The inspector's `● REC` indicator surfaces which fields are currently "record-hot" so there's no mystery about when record mode engages.

### Why overlay fallback instead of no-op

The user is in record mode because they want their edit to land *somewhere*. Dropping the edit when coverage is missing is a worse surprise than silently landing in the overlay. The visual cue (`● REC` vs no indicator) makes the destination discoverable.

## Rationale

### Why one stack, not two

Two stacks means the user has to know which surface their last action touched. "I dragged a clip, then deleted a layer, then edited an x value — now `⌘Z` only undoes the x and the rest of my actions are buried in a different history." That's the wrong mental model. Editors treat undo as a user-chronological rewind; our history should too.

The downside — "I undo a timeline edit and discover the overlay change I wanted to keep just got rewound" — is a straight consequence of chronological undo and is how every other editor behaves. Solved by user attention, not by splitting stacks.

### Why side-effect commands, not two reducers composed

A composed reducer would require a single top-level state shape (`{ timeline, overlay }`) and a single `produce` — either the engine grows a "studio state" type, or the studio synthesizes one. Both punch through the existing provider boundaries. Side-effect commands keep the stores' shapes private and the bus generic.

### Why the timeline store loses its local `history`

Keeping both a local and a global stack means deciding which one the inspector's keyframe write lands in, and reconciling two truth sources when the user undoes. Delete the local stack; the provider re-exposes `undo / redo / canUndo / canRedo` by delegating to `useCommands()`. The drag flows (`push(moveClipCommand(...))`) keep the same call sites; only the bus they reach changes.

### Why record mode is in-memory, not persisted

Per-project persistence would need a new overlay key (or a third file) and survives across sessions. Cross-machine? Across tabs? Opening a project in record mode is surprising if it wasn't closed that way. Session-local is the least-surprising default; revisit when a concrete user ask shows up.

### Why the command cap stays at 200

Session 08 picked 200 without evidence of pain; keeping it here means we don't regress memory on a surface where overlay entries and timeline entries now share the budget. Overlay commands capture small objects (path arrays, property strings, numbers), so the 200 ceiling covers minutes of steady editing. If it bites, bump it per-surface.

## Consequences

- New: `apps/studio/src/lib/commands/{types.ts,store.ts}` and `<CommandProvider>` + `useCommands()` in the same directory.
- `TimelineStore`: `history` field + `clearHistory` removed; `push/undo/redo/canUndo/canRedo` delegate to `useCommands()`. Existing commands in `timeline/commands.ts` change shape from `(draft: Timeline) => void` to side-effect, closing over the store. `commands.test.ts` updates its round-trip helper to take the store.
- `OverlayStore`: public mutators (`setOverride`, `removeOverride`, `addNode`, `deleteNode`, `restoreNode`) route through `commands.push(...)`. Raw mutators stay as private helpers for the commands to call. No-op short-circuits (already-deleted, already-added, remove-missing-override) happen before `push` so the stack stays clean.
- `useUndoHotkeys` moves from `features/timeline/` to `src/lib/useUndoHotkeys.ts` and reads `useCommands()` at call time. The editable-target guard stays.
- New feature slice `features/record/{context,RecordProvider,RecordToggle,index}.ts`. Toggle sits next to the playback controls in the top bar. `R` hotkey toggles; guarded against editable targets.
- New in `timeline/commands.ts`: `upsertKeyframeCommand(timeline, trackId, clipId, localTime, prevKeyframe | null, nextValue)`. `round` semantics match the existing commands.
- Inspector field editors stop calling `overlay.setOverride` directly. A new `features/inspector/routeCommit.ts` dispatches between `setOverrideCommand` and `upsertKeyframeCommand` per the routing rule; it also exposes `findNumberTrackCoverage` so the field can render the `● REC` indicator.

## Out of scope (session 11)

- Auto-create tracks / clips from record mode. Overlay-side "also write the override so the value is visible when the playhead leaves the clip" — not yet; coverage-gated writes keep the story simple.
- Vec3 keyframe recording. Requires `Clip<Vec3>` schema work.
- Non-transform property recording (color, material, text).
- Coalescing rapid commits into one stack entry. Each `onCommit` pushes independently.
- Record-mode persistence.
- Live-scrub recording (auto-key while the playhead moves with a modifier held).
- Labeled undo UI (history panel, per-command labels in DOM).

## Alternatives considered

- **Per-feature stacks with a global "union" view.** Rejected — the union is chronological, so you end up maintaining both truths and syncing them. Might as well pick one.
- **Reducer-style commands + a top-level studio state.** Rejected — would require synthesizing a state type that cross-cuts timeline and overlay, re-plumbing every mutation path, and breaking the provider isolation that currently lets each feature own its persistence effect.
- **Record-mode as a modal sub-editor (Premiere-style "S" keyframing).** Rejected for v1 — the gains over a plain toggle aren't proportional to the UX surface.
- **Silent no-op when record mode hits uncovered property.** Rejected — lost edits are worse than unexpected-destination edits, especially with the `● REC` indicator telling you ahead of time which fields are hot.
- **`push` returns the command so callers can compose.** Rejected — every real call site is one command, and composition would be better served by an explicit batch API if the need ever shows up.

## When to revisit

- **Coalescing.** If inspector drags (number input spin) produce noisy stacks, coalesce consecutive `setOverrideCommand` / `upsertKeyframeCommand` on the same key within a short time window.
- **Auto-create clip/track from record mode.** Paired with a timeline-authoring UX session.
- **Vec3 keyframes.** Driven by a feature ask (3D rig animation, etc.); extends `NumberTrack` to a `Track<Vec3>` variant or a `Vec3Track`.
- **Labeled history UI.** If users want to jump to a past state; today the undo stack is invisible and just works.
- **Record-mode persistence.** If opening a project "in record mode" becomes a user expectation.
