# Session 08 — Studio: command store + clip/keyframe editing

**Estimated:** ~2h focused
**Depends on:** Session 03 (timeline primitives, `serializeTimeline`), Session 07 (`TimelineProvider`, `moveClip`, `startPointerDrag`, clip/keyframe render), Session 06 (`writeTimeline` persistence)
**Status:** done
**Links:** `plans/decisions/0003-scene-source-format.md`, `plans/decisions/0005-track-target-by-path.md`, `apps/studio/src/features/timeline/CLAUDE.md`, `plans/sessions/session-07-interactive-timeline.md`

## Goal

End state: every destructive edit to the timeline flows through a **command store** with linear undo/redo, and the timeline's interaction surface covers the three mutations users expect from a "v1 editor": drag a clip, drag a clip's left or right edge to trim, and drag a keyframe to retime it. `cmd/ctrl+Z` undoes the last command; `cmd/ctrl+shift+Z` redoes. The undo stack survives within a session but resets on project swap. A clip can be selected (session 07 already selects) and the inspector panel — still read-only this session — renders the selected clip's summary (id, start, end, duration, keyframe count, target). Keyframes render their easing glyph and respond to pointer drag inside their clip's bounds; value-axis drag is **out of scope** (they stay on the row centreline), time-axis only. Every command mutation still goes through the existing debounced persistence layer, so `projects/<name>/timeline.json` stays authoritative. **Scope-splitting note:** the original roadmap row for session 08 bundled (a) inspector edits, (b) node create/delete, (c) keyframe-record mode, and (d) undo/redo. Items (a/b/c) all require resolving how scene-structure edits persist (ADR 0003 defers this to "session 08's overlay state file"); that design work + implementation would blow the 2h budget if jammed alongside commands. This session ships (d) as foundation plus the natural session-07 follow-ons (trim, keyframe drag). Session 09 takes the overlay state file (new ADR), inspector editing, node create/delete, and record-mode. The roadmap in `plans/overview.md` gets updated in task 7 below.

## Design

### Scope decisions locked this session

1. **Commands, not patches.** The undo surface is a list of `Command` objects with `apply(store)` and `invert(store)` methods — not a JSON-patch log against `serializeTimeline(timeline)`. Rationale: patches against the serialized form would resurrect the "clobber floating-point drift" rounding already in place in `moveClip`, and would re-validate the whole timeline on every undo. Command objects capture the minimal information needed to revert (pre/post values on the clip/keyframe they touched) and run in O(1). A future undo-visualiser can stringify commands for display; the history itself stays structural.

2. **One command store, owned by `<TimelineProvider>`.** Not a separate provider. The store lives alongside `moveClip` and friends in `store.ts`; session 09's scene-mutation commands plug into the same stack when they land. This keeps "what can be undone" in one place and avoids two competing histories. Shape:

   ```ts
   type Command = {
     label: string;                  // "Move clip", "Trim clip right", "Move keyframe"
     apply: (draft: Timeline) => void;
     invert: (draft: Timeline) => void;
   };
   type History = {
     past: Command[];
     future: Command[];
   };
   ```

   Exposed via `useTimeline().history` with `canUndo()`, `canRedo()`, `undo()`, `redo()`. `past`/`future` are Solid stores so UI can `<Show when={canUndo()}>` a "Undo" button (not built this session, but hook surface is stable). Cap `past` at 200 entries (FIFO drop); `future` clears on any new `push`. 200 is arbitrary — revisit only if memory becomes an issue (unlikely at plain-object scale).

3. **Drag-in-progress is NOT in the undo stack.** A clip drag, trim drag, or keyframe drag mutates the store continuously while the pointer moves (so the preview stays live), but a single `Command` is pushed on `pointerup` capturing `(pre, post)`. `pointercancel` reverts the in-progress mutation and pushes nothing. This keeps one drag = one undo step; without it, hammering the mouse would fill the stack. Implementation: each drag handler computes a pre-snapshot on `pointerdown`, mutates freely on `pointermove`, and on `pointerup` synthesises a command by diffing pre vs current.

4. **Persistence semantics unchanged.** `useTimelinePersistence` keeps listening to `serializeTimeline(timeline)`. Commands mutate the store → effect fires → debounced save. Undo/redo flips the same bits → effect fires → save. No "skip save on undo" mode; on-disk state always matches in-memory state.

5. **Keyboard scope: global, but ignored when a form control is focused.** `cmd/ctrl+Z` / `cmd/ctrl+shift+Z` / `cmd/ctrl+Y` are registered on `window` in a new hook `useUndoHotkeys()` mounted inside `<TimelineProvider>`. Guard: if `document.activeElement?.matches("input, textarea, [contenteditable]")` then don't handle — let native field-level undo work. No per-panel undo scopes yet; when the inspector ships in session 09, the guard covers its inputs.

6. **Trim semantics: absolute edge move, clamped, keyframes preserved in clip-local time.**
   - **Left trim (`resizeClipLeft`):** new `start` ∈ `[0, clip.end - MIN_CLIP_SEC]`. Keyframes store **clip-local** times (per session 03), so pulling the left edge right makes the early keyframes "disappear" out the left side but we don't delete them; they keep their `time` value and just fall outside the playable range (already the engine's behaviour — keyframes with `time < 0` are clamped by `evaluateClip`). Pulling left leaves clip-local times intact too. This matches Premiere's "slip"-less trim: edge moves, content stays put in absolute time.
   - **Right trim (`resizeClipRight`):** new `end` ∈ `[clip.start + MIN_CLIP_SEC, sceneDuration]`. Same no-delete rule on trailing keyframes.
   - `MIN_CLIP_SEC = 0.05` — effectively 1 frame at 30 fps but we keep it continuous. Prevents degenerate zero-width clips. No `MAX_CLIP_SEC`; scene-duration clamp is the ceiling.

7. **Keyframe drag: time only, clip-bounded.**
   - Pointerdown on a keyframe diamond captures `start = keyframe.time` (clip-local), `startPx = e.clientX`.
   - Pointermove: `dt = (e.clientX - startPx) / zoom`, new time = `clamp(start + dt, 0, clip.end - clip.start)`.
   - If the user drags past a neighbour keyframe, **reorder** (session 03's `evaluateClip` requires monotonic times — we sort post-drag). Sorting mid-drag would make the cursor jump off the kept diamond visually, so sort on pointerup only, and in the meantime allow the drag to "push through" by letting the active keyframe hold an out-of-order `time`. At most one keyframe is out of order at a time, and the evaluator only fails if a prior keyframe's time ≥ the next one's — which during a push-through scenario means the evaluator briefly returns the "pre-crossover" value. Acceptable while dragging; snapped to order on release. Concretely: hold a private `draggingKeyframeId` on the clip; when it's non-null, `evaluateClip` still works because our monotonicity check is `a.time < b.time`, not `<=`, and our interpolator linearly walks from the first keyframe under `t` to the first above — minor visual glitch during cross-over is acceptable and matches Figma/Premiere.
   - On pointerup: sort this clip's keyframes by `time` (stable), clear `draggingKeyframeId`, push one `MoveKeyframeCommand`.
   - **No value-axis drag this session.** Keyframes stay on the row centreline. Value editing lands with the inspector (session 09) because it needs a number input for precision and for non-numeric properties to eventually have the same editing UX.
   - **Track-order invariance:** the keyframe stays on its original track; cross-track drag would be a copy/move operation with UX questions — out of scope.

8. **Clip selection extended with keyframe selection (single).** `view.selection` becomes `{ clipId: string | null; keyframeId: string | null }` (keyframe ids are `${clipId}:${index}` stringly — session 03 keyframes don't have ids of their own; we key by position in the array which is stable between sorts because sort is by the same index-tied `time`). Clicking a keyframe selects it and its owning clip. Clicking empty space clears both. Inspector reads both. `selectClip(id)` remains as a wrapper; new `selectKeyframe(clipId, index)`. Multi-select remains out of scope.

9. **Inspector: read-only panel showing selection summary.** Replaces the "Property editors bind to the current selection in *session 08*." placeholder in `App.tsx`. When a clip is selected, show: `target.nodePath`/`nodeId`, `target.property`, `start`, `end`, `duration`, keyframe count. When a keyframe is selected, show: absolute time (`clip.start + keyframe.time`), clip-local time, value, easing. No editing. Tiny feature under `apps/studio/src/features/inspector/` with its own `CLAUDE.md` noting the read-only caveat and the session-09 expansion path. Solid JSX + the same `label`/`panel-body` classes already in `styles.css` — no new styling tokens needed.

10. **Undo keybindings indicated in the UI.** A minimal hint next to the Inspector panel head: `<span class="hint">⌘Z / ⌘⇧Z</span>` (mac glyph pair). Accessible from keyboard regardless; visible in the UI so a cold user knows the feature exists. Styling inherits from `styles.css`; add one low-contrast `.panel-head__hint` rule.

11. **Easing glyph on the keyframe diamond.** Currently all keyframes render identical diamonds (session 07). This session adds a small inside-fill pattern distinguishing linear (filled), ease-in-out-cubic (right-leaning triangle fill), ease-in-cubic (left-leaning fill), ease-out-cubic (right-leaning, mirrored). Via CSS `background-image: linear-gradient(...)`; no SVG. Helps users see which keyframe controls which curve without hovering. Colour stays aquamarine.

12. **No snap, no scrub-snap, no grid.** The roadmap had "Snap to playhead" as session-08 fodder; empirically keyframe drag + clip drag without snap on the 6s example is already usable. Snap is a UX polish pass; push to a later session (and probably a dedicated snap-manager feature so audio waveforms, captions, etc. can all register snap targets). Explicit non-goal here.

### Module layout (new + changed)

```
apps/studio/src/
├── features/
│   ├── timeline/
│   │   ├── store.ts                       # +commands, +history, +resizeClipLeft/Right, +moveKeyframe
│   │   ├── context.ts                     # +history surface, +selectKeyframe, selection shape widened
│   │   ├── TimelineProvider.tsx           # wires history + useUndoHotkeys()
│   │   ├── Clip.tsx                       # +edge-grab handles, +drag = resizeClip*
│   │   ├── Keyframe.tsx                   # +drag via startPointerDrag → moveKeyframe
│   │   ├── useUndoHotkeys.ts              # NEW — cmd/ctrl+Z / cmd/ctrl+shift+Z, focused-input guard
│   │   ├── commands.ts                    # NEW — Command factories: MoveClip, ResizeClipLeft, ResizeClipRight, MoveKeyframe
│   │   ├── commands.test.ts               # NEW — unit tests: apply+invert are inverses on sample Timeline
│   │   └── CLAUDE.md                      # updated: selection shape, history scope, trim/keyframe semantics
│   └── inspector/                         # NEW feature slice (read-only v1)
│       ├── CLAUDE.md
│       ├── Inspector.tsx                  # reads useTimeline().view.selection
│       └── index.ts
├── App.tsx                                # swaps the "Inspector lands session 08" placeholder for <Inspector />
└── styles.css                             # +.tl-clip__handle, +keyframe easing glyphs, +.panel-head__hint
```

### Core shapes

```ts
// features/timeline/commands.ts
import type { Timeline } from "@kut-kut/engine";

export type Command = {
  label: string;
  apply: (draft: Timeline) => void;
  invert: (draft: Timeline) => void;
};

export const moveClipCommand = (
  trackId: string,
  clipId: string,
  prevStart: number,
  nextStart: number,
): Command => { /* applies delta to clip.start/end preserving duration */ };

export const resizeClipLeftCommand = (
  trackId: string,
  clipId: string,
  prevStart: number,
  nextStart: number,
): Command => { /* mutates clip.start only */ };

export const resizeClipRightCommand = (
  trackId: string,
  clipId: string,
  prevEnd: number,
  nextEnd: number,
): Command => { /* mutates clip.end only */ };

export const moveKeyframeCommand = (
  trackId: string,
  clipId: string,
  keyframeIndex: number,
  prevTime: number,
  nextTime: number,
): Command => { /* mutates kf.time; re-sort on apply+invert */ };
```

```ts
// features/timeline/store.ts (additions)
export const createTimelineStore = (initial: Timeline) => {
  const [timeline, setTimeline] = createStore<Timeline>(initial);
  const [history, setHistory] = createStore<History>({ past: [], future: [] });

  const push = (cmd: Command): void => {
    setTimeline(produce(cmd.apply));
    setHistory("future", []);
    setHistory("past", (p) => (p.length >= 200 ? [...p.slice(1), cmd] : [...p, cmd]));
  };
  const undo = (): void => { /* pops past, inverts, pushes to future */ };
  const redo = (): void => { /* pops future, applies, pushes to past */ };
  const canUndo = (): boolean => history.past.length > 0;
  const canRedo = (): boolean => history.future.length > 0;

  // Thin wrappers callers use:
  const moveClip = (trackId, clipId, nextStart): void => { /* read current, push command */ };
  const resizeClipLeft = (trackId, clipId, nextStart): void => { ... };
  const resizeClipRight = (trackId, clipId, nextEnd): void => { ... };
  const moveKeyframe = (trackId, clipId, idx, nextTime): void => { ... };

  return { timeline, setTimeline, history, push, undo, redo, canUndo, canRedo,
           moveClip, resizeClipLeft, resizeClipRight, moveKeyframe };
};
```

```ts
// features/timeline/context.ts (widened selection + history surface)
export type TimelineSelection = { clipId: string | null; keyframeId: string | null };
// keyframeId shape: `${clipId}:${index}`

export type TimelineContextValue = {
  name: Accessor<string>;
  duration: Accessor<number>;
  timeline: Store<Timeline>;
  view: Store<TimelineView>;     // selection shape widened
  setView: SetStoreFunction<TimelineView>;
  moveClip: (trackId: string, clipId: string, newStart: number) => void;
  resizeClipLeft: (trackId: string, clipId: string, newStart: number) => void;
  resizeClipRight: (trackId: string, clipId: string, newEnd: number) => void;
  moveKeyframe: (trackId: string, clipId: string, index: number, newTime: number) => void;
  selectClip: (clipId: string | null) => void;
  selectKeyframe: (clipId: string, index: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  saveState: Accessor<TimelineSaveState>;
  saveError: Accessor<Error | null>;
};
```

### Interaction details

- **Clip edge handles.** 6 px grab strip at each end of every clip body. Cursor `col-resize`. Pointerdown: same `startPointerDrag` helper. Edge handle's drag calls `resizeClipLeft`/`Right`; body drag still calls `moveClip`. Handle hit-test wins over body via stacking order in the DOM (handle is an `absolute` child painted last).
- **Keyframe drag.** Pointerdown on diamond: `e.stopPropagation()` (existing — prevents clip drag), then start a drag session capturing `start = keyframe.time`, `startPx = e.clientX`. On move: compute new clip-local time, clamp `[0, clip.end - clip.start]`, write via `setTimeline("tracks", tIdx, "clips", cIdx, "keyframes", kIdx, "time", newTime)` directly (no command yet — we'll push once on release). On end: sort keyframes, push `moveKeyframeCommand(prev, next)`. On cancel: revert to `start`.
- **Selection clicks.** Pointerdown on clip body with <3px total motion threshold → `selectClip`. Pointerdown on keyframe with <3px → `selectKeyframe(clipId, idx)`. Pointerdown on empty track space → clear selection.
- **Undo/redo keybinding handling.** `useUndoHotkeys` uses `window.addEventListener("keydown", ...)` with `onCleanup`. Match `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey` → `undo()`; `...&& e.shiftKey` or `key === "y"` → `redo()`. `preventDefault()` when we handle. No-op when focused element is editable.

### Inspector shape

```tsx
// features/inspector/Inspector.tsx
const Inspector = (): JSX.Element => {
  const t = useTimeline();
  const selectedClip = () => findSelectedClip(t.timeline, t.view.selection);
  const selectedKeyframe = () => findSelectedKeyframe(t.timeline, t.view.selection);
  return (
    <Show when={selectedKeyframe()} keyed fallback={<ClipPanel clip={selectedClip()} />}>
      {(kf) => <KeyframePanel data={kf} />}
    </Show>
  );
};
```

Both subpanels are pure read-outs. `KeyframePanel` shows absolute time, local time, value, easing. `ClipPanel` shows id, target path/property, start, end, duration, keyframe count. Empty state shows "Select a clip or keyframe.". A single hint row below: `<span class="panel-head__hint">⌘Z / ⌘⇧Z to undo / redo</span>`.

### Testability

Commands are pure functions over a `Timeline` draft, so `commands.test.ts` does `apply → invert → structuralEqual(before)` round-trips against hand-crafted fixtures covering:
- `moveClipCommand`: simple move, end-at-boundary.
- `resizeClipLeftCommand` / `resizeClipRightCommand`: shrink / grow.
- `moveKeyframeCommand`: move without reorder, move with reorder (starts at index 1, moves before index 0).

No DOM, no Solid reactivity — these are plain TS round-trips. Per `feedback_ui_verification.md`, UI interactions stay manual.

### HMR + lifecycle

- Project swap: `<TimelineProvider>` remounts; history resets. Documented in `features/timeline/CLAUDE.md` under Persistence (the persistence section gets a new "History" subsection).
- Scene HMR: same remount behaviour; we lose undo history. Acceptable — scene edits are author intent, not undoable studio actions.
- The persistence effect sees commands as normal mutations; nothing special.

### Public surface

Engine: no new exports. Studio: `Inspector` under `features/inspector`, history surface added to `useTimeline()`. `useUndoHotkeys` stays private to `features/timeline/`.

### Roadmap update

`plans/overview.md` row 08 currently reads: "Property editors bound to selection, create/delete nodes, undo/redo via command store, keyframe-record mode". Update in task 7 to reflect the split:

- **08 (this session):** "Command store + undo/redo, clip trim, keyframe drag, read-only inspector."
- **09 (new row, shifts audio-core to 10):** "Scene overlay state + inspector editing + node create/delete + keyframe record."
- Audio core shifts from 09 → 10; subsequent rows each shift by one. Before renumbering, write a short note at the top of `overview.md` explaining the shift so git-log readers understand why session filenames and roadmap numbers diverged for one session.

If the user would rather not shift the whole table, an alternative is to keep session 09's current label (Audio core) and insert the scene-overlay work as session 8b / 8½ without renumbering. Discuss before committing to the shift.

## Tasks

1. [ ] **Commands module + tests.** Create `features/timeline/commands.ts` with the four command factories from Core shapes. Pure functions — no Solid reactivity. Add `commands.test.ts` (~6 cases incl. keyframe reorder). `bun test` green. ~25 min.
2. [ ] **History in the store.** Extend `createTimelineStore` with `push / undo / redo / canUndo / canRedo` and the `past/future` stacks (cap 200). Thread through context + provider. Re-implement `moveClip` as a command producer (computes prev from current state, pushes). Typecheck clean. ~20 min.
3. [ ] **Undo hotkeys.** `useUndoHotkeys` hook with focused-input guard; mount inside `TimelineProvider`. Manual verify: tweak a clip's start by direct store call from dev console, press cmd+Z → reverts; cmd+shift+Z → re-applies. ~15 min.
4. [ ] **Clip trim handles.** Add 6 px edge grab zones in `Clip.tsx`. Drag fires `resizeClipLeft/Right`. Pointerdown captures pre, pointerup pushes command. Update `.tl-clip` CSS (cursor region, optional hover tint on handle). Browser verify: trim left of rotation clip → keyframes outside trimmed area become "invisible" (clamped); reverse-trim back → fine again; undo → restored. ~25 min.
5. [ ] **Keyframe drag.** `Keyframe.tsx` gets pointer drag that mutates `keyframe.time` during move, sorts + pushes command on release. Honour clip bounds. Easing glyph CSS variants on the diamond. Browser verify: drag middle keyframe of `t-x` from t=2 to t=1 → animation in preview shifts; undo restores; drag past neighbour keyframe → reorders correctly post-release. ~25 min.
6. [ ] **Inspector feature slice.** New `features/inspector/` with `Inspector.tsx` (read-only summary) and `CLAUDE.md`. Wire into `App.tsx`'s right panel in place of the placeholder `<p>`. Keyframe selection added to view state; keyframe click selects, empty-track click clears. Browser verify: click clip → inspector shows clip fields; click keyframe → inspector shows kf fields; click empty track → blank state. ~25 min.
7. [ ] **Roadmap update + verification sweep.** Edit `plans/overview.md`: split row 08 into 08 (this session's content) and a new row for scene overlay / inspector editing / create-delete / record mode; renumber 09+ or insert as 08.5 per user preference captured at spec approval. Run `bun run typecheck`, `bun run lint`, `bun test`. Fill Outcome. ~15 min.

## Non-goals

- **Scene-structure mutation from the GUI** (add node, delete node, rename node, reparent). Requires an overlay state file per ADR 0003 — session 09.
- **Inspector property editing.** Read-only panel this session; number inputs / colour pickers land with the overlay file.
- **Keyframe-record mode.** Needs inspector editing + overlay first. Session 09.
- **Keyframe value-axis drag.** Precise value edits belong in the inspector. Same reason, same session.
- **Cross-clip / cross-track keyframe drag.** UX questions; deferred indefinitely.
- **Keyframe easing change.** Right-click menu or inspector editor; session 09.
- **Snap (to playhead, to grid, to other keyframes).** Needs a snap-manager abstraction so audio / captions can register. Deferred to a dedicated polish session.
- **Multi-select, marquee select, copy/paste, keyboard clip nudge.** Quality-of-life batch; revisit after session 09 when we've seen the add-node UX.
- **Undo UI buttons / redo UI buttons.** Hotkeys are the primary surface. Buttons can come with the inspector panel once it has chrome.
- **Per-panel undo scopes** (e.g. a separate history for asset import). One shared history; revisit only if we get conflicts.
- **External timeline-file hot reload.** Same session-07 caveat still applies — hand-edits get clobbered.
- **Tests for UI drag flows.** Manual per `feedback_ui_verification.md`. Only `commands.test.ts` is automated.
- **New ADR.** Session 08 ships no architectural decision. Session 09's overlay state file will need one.

## Verification

- `bun run dev` starts cleanly on the example project.
- **Commands + undo round-trips:**
  - Drag the `t-rot` clip right by ~1 s; `cmd+Z` restores `start=0`; `cmd+shift+Z` re-applies. `projects/example/timeline.json` on disk reflects the current state after each step (wait 300 ms).
  - Rapidly undo and redo 5 times — stack doesn't corrupt.
- **Clip trim:**
  - Trim left of `t-x` from 0 to 1 s: clip visibly shrinks from the left, preview at t=0..1 holds the pre-first-keyframe value, t=1..4 interpolates as before. Undo restores. File updates.
  - Trim right past scene duration clamps to `sceneDuration` (6).
  - Trim to `< MIN_CLIP_SEC` (0.05) clamps at the minimum.
- **Keyframe drag:**
  - Drag middle keyframe of `t-x` (at t=2 in clip-local) from absolute 2 → 1: preview animation visibly shifts. Undo restores to 2. Tooltip updates in real time.
  - Drag the t=0 keyframe past t=2 (cross-over): on release, keyframes re-sort; evaluator keeps working; undo restores the pre-drag order.
  - Clip-bound clamp: can't drag below 0 or past `clip.end - clip.start`.
- **Selection:**
  - Click clip → aquamarine border; inspector shows clip summary.
  - Click keyframe → kf diamond highlighted; inspector shows keyframe summary (absolute t, local t, value, easing).
  - Click empty row space → both clear; inspector empty state.
- **Inspector:**
  - Summary reads correctly for all three example tracks.
  - Hint row shows "⌘Z / ⌘⇧Z" and is visually subdued.
- **Hotkeys:**
  - `cmd+Z` / `cmd+shift+Z` works globally.
  - Focus a (future) text input — not in this session's UI, so simulate by focusing the browser URL bar or the devtools — `cmd+Z` in the URL bar doesn't undo the timeline. For this session, accept that there's no focus-guard test target built-in.
- **Persistence:**
  - Every command (drag or undo) produces exactly one debounced POST within 300 ms.
  - No regressions: schema validation still catches malformed writes.
- `bun run typecheck`, `bun run lint`, `bun test` all green. New tests: `features/timeline/commands.test.ts`.
- `plans/overview.md` reflects the scope split; row 08 matches shipped scope; a session-09 row exists for overlay state + inspector editing + create/delete + record mode.

## Outcome

- **Shipped:**
  - `features/timeline/commands.ts` + `commands.test.ts` — four command factories (`moveClip`, `resizeClipLeft`, `resizeClipRight`, `moveKeyframe`) with round-trip tests including keyframe reorder in both directions.
  - History in `createTimelineStore` — `push`/`undo`/`redo`/`canUndo`/`canRedo`, capped at 200, wired through `TimelineContext`. Commands are setter-style and idempotent, so `push` after a drag is a safe no-op on the current state.
  - `useUndoHotkeys` — `⌘Z` / `⌘⇧Z` / `⌘Y` on `window` with an editable-target guard (inputs, textareas, `contenteditable`). Mounted inside `<TimelineProvider>`.
  - Clip trim handles (6 px left/right grab strips, `col-resize` cursor) with `MIN_CLIP_SEC = 0.05` clamp, scene-duration ceiling on the right.
  - Keyframe time-axis drag, clip-bounded. Sort happens on release; intermediate cross-over is permitted.
  - Easing glyphs on keyframes via `clip-path: polygon(...)` diamond + per-easing background pattern: linear (solid), ease-in (right half), ease-out (left half), ease-in-out (solid + dark core dot), step-hold (hot ring). Selection highlight uses `filter: drop-shadow`.
  - `features/inspector/` read-only slice (`Inspector.tsx`, `CLAUDE.md`, `index.ts`), wired into `App.tsx` with `InspectorHint` in the panel head.
  - `TimelineSelection` widened to `{ clipId, keyframeId }`; `selectKeyframe`, `clearSelection`, `makeKeyframeId`/`parseKeyframeId` helpers.
  - `apps/studio/src/features/timeline/CLAUDE.md` updated to document the new mutation surface, history, and trim semantics. Roadmap table in `plans/overview.md` split session 08 and shifted 09+ down by one.

- **Deferred (now session 09):** scene overlay state file + new ADR, inspector property editing, node create/delete, keyframe record mode, keyframe easing-change UI, keyframe value-axis drag. Additional deferrals in non-goals: snap, multi-select, marquee, copy/paste, cross-track keyframe drag, external `timeline.json` hot reload, undo UI buttons.

- **Surprises:**
  - Initial left-trim implementation followed the literal "mutate `clip.start` only" reading of the spec. In practice that made keyframes track the left edge (slip behaviour), which contradicted the spec's own "Premiere slip-less" claim. Fixed mid-session: `resizeClipLeft` and `resizeClipLeftCommand` now shift every keyframe's `time` by `-Δstart` so absolute time is preserved. Commands became non-idempotent under the naive setter approach, so apply/invert were rewritten to check `clip.start === target` before re-shifting — keeps `push`-after-drag a no-op but makes undo/redo round-trip keyframe positions correctly. `commands.test.ts` pins the new semantics with explicit keyframe-time assertions.
  - Keyframe drag's `[0, clipDuration]` clamp means an out-of-range keyframe (left behind by a trim) snaps to the nearest clip edge when grabbed. Both edges behave this way symmetrically now that left-trim is fixed. Confirmed with the user as acceptable for v1.
  - `projects/example/timeline.json` is rewritten by the dev-plugin on every edit with a format that disagreed with Biome's JSON formatter. Rather than couple the persistence serializer to Biome, added `!projects` to `biome.json#files.includes` — user data files live outside lint scope.
  - `parseKeyframeId` uses `lastIndexOf(":")` so clip ids containing colons are still parseable.

- **Follow-ups:**
  - Session 09 ADR: scene overlay state file (where do edits to `scene.ts`-derived structure live? is it a JSON diff alongside the timeline, or a separate file?). Blocks inspector editing, node create/delete, and record mode.
  - UX polish candidate: reachable-hidden-keyframes. Possibly via a keyframe list in the inspector, so hidden ones can be selected and dragged without first needing a snap into the clip.
  - Undo/redo UI affordance: add actual buttons once the inspector chrome settles.
  - Snap-manager abstraction so future registers (audio, captions, other keyframes) can declare targets.
  - Revisit `HISTORY_CAP = 200` if anyone complains; arbitrary ceiling.
