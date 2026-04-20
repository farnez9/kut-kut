# Session 11 — Studio: keyframe record mode + unified undo

**Estimated:** ~2h focused
**Depends on:** Session 07 (timeline commands + history), Session 08 (per-feature command store), Session 09 (inspector overlay writes), Session 10 (overlay v2 structural ops)
**Status:** done
**Links:** `plans/decisions/0005-track-target-by-path.md`, `plans/decisions/0006-scene-overlay-state.md`, `plans/decisions/0007-overlay-node-ops.md`, `plans/decisions/0008-unified-command-store.md` (this session)

## Goal

End state: one undo stack spans the timeline store **and** the overlay store, so ⌘Z rolls back the most recent user action regardless of which side made it. A top-bar **Record** toggle turns inspector transform edits into keyframe writes: when ON, editing a property whose node has a covering number-track clip at the current playhead upserts a keyframe at `t - clip.start` instead of writing an overlay override; when OFF (default), edits still go through the overlay. All mutations — timeline drags, override edits, overlay structural ops, and record-mode keyframe writes — push through the same command bus, and ⌘Z / ⌘⇧Z act on the global stack.

## Design

ADR 0008 locks the bus shape and record-mode routing rule. Summary here — rationale there.

### Command bus (new `apps/studio/src/lib/commands/`)

```ts
// lib/commands/types.ts
export type Command = {
  label: string;      // short, user-facing; shown in dev tools for now
  apply: () => void;  // side-effecting; closes over the stores it needs
  invert: () => void;
};

// lib/commands/store.ts
export type CommandStore = {
  push: (cmd: Command) => void;     // calls cmd.apply(); records; clears future
  undo: () => void;
  redo: () => void;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  clear: () => void;                // on project swap
};
export const createCommandStore = (): CommandStore;
```

Single `createCommandStore()` instance per project lifetime. Cap 200. Timeline + overlay stores **both** take a `CommandStore` at construction and route mutations through it.

- `<CommandProvider>` wraps `<TimelineProvider>` and `<OverlayProvider>` in `App.tsx`.
- `useUndoHotkeys` moves to `src/lib/useUndoHotkeys.ts`, reads `useCommands()`.
- Project swap → `commands.clear()` in the `<Show keyed>` teardown path (the provider unmounts anyway, but we also clear explicitly for HMR safety).

### Overlay → commands

Every mutation in `OverlayStore` becomes a thin wrapper that builds a command and calls `commands.push(cmd)`. The raw in-place mutators stay as private helpers the commands call. Commands:

- `setOverrideCommand(nodePath, property, prevValue | undefined, nextValue)` — upsert (apply) / revert or delete (invert).
- `addNodeCommand(addition)` — push entry (apply) / splice by `(parentPath, name)` (invert).
- `deleteNodeCommand(path)` — push deletion (apply) / splice by `path` (invert). Upsert: if the path is already deleted, the command is a no-op and **not** pushed.
- `restoreNodeCommand(path)` — splice matching deletion (apply) / push it back (invert). If the path isn't currently deleted, no-op & not pushed.

`removeOverride` is folded into `setOverrideCommand` (nextValue is `undefined` → delete). The context surface keeps the same method names; behaviour is unchanged except edits are now undoable.

### Timeline → commands

Existing `commands.ts` already returns `Command`-shaped objects against a `Timeline` draft. Port them to the new side-effect-based `Command` type by closing over the timeline store. `push` / `undo` / `redo` delegate to the global bus; the local store stops maintaining `history`.

New command for record mode:

- `upsertKeyframeCommand(trackId, clipId, localTime, prevKeyframe | null, nextValue)` — if a keyframe at `localTime` exists (after rounding), update its value; otherwise insert + sort. Invert restores the `prevKeyframe` (delete if it was `null`).

`round(v) = Math.round(v * 1000) / 1000` (same as existing commands). Two keyframes within rounding tolerance of each other collide on the same slot.

### Record mode

New tiny feature slice `features/record/`:

- `RecordProvider` + `useRecord()` exposing `{ active: Accessor<boolean>; toggle(): void }`. Stored as a `createSignal(false)` local to the provider; **not persisted** this session (follow-up).
- `<RecordToggle>` — a button in the top bar next to the playback controls. Active state styled with the aquamarine accent.
- Hotkey `R` — toggles record mode, ignored when focus is in an editable element (reuse the guard from `useUndoHotkeys`).

### Inspector routing

`Field2D` / `FieldVec3` / `FieldOpacity3D` currently call `overlay.setOverride(path, prop, v)` on commit. New helper:

```ts
// features/inspector/routeCommit.ts
type RouteDeps = { overlay: OverlayContextValue; timeline: TimelineContextValue; record: RecordContextValue; commands: CommandStore; playback: PlaybackContextValue };

export const commitPropertyEdit = (deps: RouteDeps, nodePath: string[], property: string, nextValue: OverrideValue): void => {
  if (deps.record.active() && typeof nextValue === "number") {
    const hit = findNumberTrackCoverage(deps.timeline.timeline, nodePath, property, deps.playback.time());
    if (hit) {
      const { trackId, clipId, localTime, prevKeyframe } = hit;
      deps.commands.push(upsertKeyframeCommand(deps.timeline, trackId, clipId, localTime, prevKeyframe, nextValue));
      return;
    }
  }
  // Fallback: overlay override (unchanged behaviour).
  const prev = deps.overlay.getOverride(nodePath, property);
  deps.commands.push(setOverrideCommand(deps.overlay, nodePath, property, prev, nextValue));
};
```

`findNumberTrackCoverage` iterates `timeline.tracks`, matches by path + property (track targets are by-path per ADR 0005), finds a clip containing `t`, and returns the rounded `localTime` plus the existing keyframe at that slot (if any) for inversion. **Vec3 edits fall back to overlay override even in record mode** — vec3 keyframes aren't in the track schema today. Flagged as follow-up.

### Visual cue

When record mode is ON:
- Top-bar toggle shows an active state (aquamarine border + filled dot).
- The inspector's section header gets a subtle `● REC` indicator on properties that **would** be recorded (a matching number-track clip covers the playhead). Properties that'd fall back to overlay are unannotated.

No live scrubbing / auto-keying while dragging the playhead. Record mode only kicks in on explicit field commits.

## Tasks

1. [x] **ADR 0008 — unified command store + record-mode routing.** Decision, Command shape (side-effect-based), why single stack, what does NOT flow through commands (view state, selection, playback, HMR reload), record-mode routing rule (number-track coverage required; vec3 + missing-coverage fall back to overlay), out-of-scope notes (auto-create tracks, non-number keyframes). `plans/decisions/0008-unified-command-store.md`. ~20 min.
2. [x] **Command bus.** `src/lib/commands/{types,store}.ts` + `<CommandProvider>` + `useCommands()`. Cap 200. `bun test` covers: push/undo/redo round-trip; clearing future on push after undo; `canUndo`/`canRedo` accessors. Move `useUndoHotkeys` to `src/lib/` and rewrite it to read `useCommands()`. ~25 min.
3. [x] **Timeline: port onto the bus.** Refactor timeline commands in `commands.ts` to the new side-effect `Command` type (close over the timeline store). Drop `history` from `TimelineStore`; `push/undo/redo/canUndo/canRedo` on the context now delegate to `useCommands()`. Existing drag flows keep calling `push(moveClipCommand(...))` etc. — signatures unchanged. Add `upsertKeyframeCommand`. Update `commands.test.ts` for the new signatures. ~30 min.
4. [x] **Overlay: wrap mutations as commands.** Build `setOverrideCommand`, `addNodeCommand`, `deleteNodeCommand`, `restoreNodeCommand` against the overlay store. Route the existing `OverlayStore` public methods through `commands.push(...)`. De-dup rules (already-deleted, already-added) short-circuit before `push`. Add small unit tests for each command's apply/invert. ~25 min.
5. [x] **Record slice + top-bar toggle.** `features/record/{context,RecordProvider,RecordToggle,index}.ts`. Wire the toggle into `App.tsx` next to playback controls. `R` hotkey (with the editable-target guard). Manual verify: toggle visible, active state renders in aquamarine, keyboard shortcut works. ~20 min.
6. [x] **Inspector: record-mode routing.** New `features/inspector/routeCommit.ts`. Replace direct `overlay.setOverride` calls in `NodePanel`'s field editors with `commitPropertyEdit(deps, ...)`. Compute the `● REC` indicator from `findNumberTrackCoverage`. ~25 min.
7. [x] **Verification sweep.** `bun test`, `bun run typecheck`, `bun run lint`. Manual: toggle record; edit a number property inside a clip → keyframe appears on timeline; ⌘Z removes it; ⌘⇧Z puts it back. Undo crosses surfaces: delete a node (overlay), drag a clip (timeline), edit an override (overlay) — one ⌘Z stack unwinds them in reverse. Fill Outcome. ~15 min.

## Non-goals

- **Auto-create tracks or clips when recording with no coverage.** Needs overlay/timeline structural coordination; out of scope. Inspector falls back to overlay override silently.
- **Vec3 keyframes.** Track schema is number-only. Vec3 record falls back to overlay.
- **Non-transform property recording** (color, material, custom).
- **Coalescing rapid-fire inspector commits into one undo entry.** Each commit is its own command.
- **Keyframe easing editing at record time.** New kf inherits the clip's default easing (today: whatever `createKeyframe`'s default is).
- **Record-mode persistence across reloads.** In-memory signal; resets on refresh.
- **Live-scrub recording** (auto-key while playhead moves with modifier held).
- **Multi-track / grouped keyframe writes.**
- **Labeled undo UI** (history list, per-command labels in the DOM).
- **History stack visualization or dev panel.**

## Verification

- `bun test` green, including `lib/commands/*.test.ts`, updated `timeline/commands.test.ts`, new overlay command tests.
- `bun run typecheck`, `bun run lint` green.
- `plans/decisions/0008-unified-command-store.md` exists and is linked from this spec.
- `bun run dev` starts cleanly.
- **Unified undo (manual):**
  - Drag a clip; delete an author-defined node via the Layers panel; edit an opacity override in the inspector. Three ⌘Z keystrokes restore in reverse order. Three ⌘⇧Z replay them.
  - Undo after a project swap: history is empty (switching projects clears the bus).
- **Record mode (manual):**
  - Toggle OFF (default): inspector edits still write to overlay overrides; timeline shows no new keyframes.
  - Toggle ON; select a node whose clip covers the playhead and whose target matches the property being edited; commit a number change → new keyframe at `t - clip.start`, preview interpolates across it. `● REC` indicator visible on the matching field(s).
  - Toggle ON; edit a property with no covering clip → falls back to overlay override; no keyframe appears.
  - Toggle ON; edit a Vec3 (e.g. 3D position) → falls back to overlay override; no keyframe.
  - `⌘Z` after a recorded keyframe removes it; `⌘⇧Z` restores it.
  - `R` toggles record mode; `R` while typing in an inspector input does NOT toggle.
