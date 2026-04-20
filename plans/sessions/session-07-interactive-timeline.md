# Session 07 — Studio: interactive timeline

**Estimated:** ~2h focused
**Depends on:** Session 03 (`Timeline`, clip-relative keyframes, `serializeTimeline`), Session 05 (`PlaybackProvider`, `<PreviewHost>` lifecycle), Session 06 (`ProjectProvider`, `writeTimeline` plugin endpoint, `bundle.timeline` on the context)
**Status:** done
**Links:** `plans/decisions/0005-track-target-by-path.md`, `apps/studio/src/features/playback/CLAUDE.md`, `apps/studio/src/features/preview/CLAUDE.md`, `apps/studio/src/features/project/CLAUDE.md`

## Goal

End state: the bottom timeline strip is a real interactive editor. When the example project loads, the strip renders one row per track with the clip rectangles and keyframe markers drawn at the right times. A ruler across the top shows tick labels that rescale with zoom, and an aquamarine playhead tracks `playback.time()` live. The user can click the ruler to seek, drag the playhead head to scrub, and drag a clip body left/right to shift its `start`/`end` (duration preserved). Zoom is pinch-friendly (ctrl/meta + wheel centred on cursor); plain wheel scrolls horizontally so long timelines pan. Every edit writes back to `projects/<name>/timeline.json` via the Vite dev plugin — debounced at 300 ms, schema-validated, one in-flight request. The preview re-evaluates in real time because the timeline is now a Solid store rather than a frozen object. No new UI for creating/deleting tracks or clips (session 08) and no trim-edge / keyframe dragging yet — those fall out of the same interaction model and are the next session's load-bearing features.

## Design

### Scope decisions locked this session

1. **Bundle's `timeline` becomes reactive inside a new `<TimelineProvider>`; it is not stored reactively by `<ProjectProvider>`.** `ProjectProvider` keeps producing a plain `Timeline` on load — its job is discovery + assembly, not live editing. A new `<TimelineProvider name duration timeline>` mounts keyed on `bundle`, converts the incoming `Timeline` into a Solid `createStore`, and exposes `{ timeline, duration, moveClip, reset, markDirty }` through `TimelineContext`. `<PreviewHost>` drops its `timeline` prop and reads from `useTimeline().timeline` so `applyTimeline(scene, t.timeline, time())` automatically subscribes to store mutations. This keeps mutation ownership localised to one feature — session 08's scene-edit commands will plug into the same store without touching `ProjectProvider`.
2. **Time ↔ pixel mapping is a pure module, not a context.** `apps/studio/src/features/timeline/mapping.ts` exports `timeToPx`, `pxToTime`, and `pickTickStep(pxPerSec)` as plain functions on a `{ pxPerSec, originSec }` view state. View state itself is a tiny reactive store in `TimelineContext` (`zoom` in px/s, `origin` in seconds). Putting the math outside reactive land makes it cheap to unit-test (session-level requirement, per `feedback_ui_verification.md` — pure utilities get `bun test`, UI flows don't) and avoids accidentally reading signals in an RAF loop.
3. **View state lives inside the timeline feature, not in playback.** View state = `{ zoom, origin, selection }`. It is UI concern only — playback cares about `time`, not pixels. Selection is a single `clipId | null` in v1; multi-select lands with session 08's inspector. Zoom defaults to `fit` (pxPerSec chosen so `duration` fills the strip width on mount, clamped to `[40, 400]`); origin defaults to `0`.
4. **Interaction model: pointer capture + delta, no HTML5 drag.** All drags use `pointerdown` → `setPointerCapture(e.pointerId)` → `pointermove` → `pointerup`, computing deltas in pixels and converting through `pxToTime`. Native `draggable="true"` is banned (ghost-image flicker, no modifier keys, no touch parity). A helper `startPointerDrag(e, handlers)` in `features/timeline/interaction.ts` captures the pointer, wires move/up/cancel, and returns a disposer — keeps every drag call site 5 lines instead of 20.
5. **Persistence is `writeTimeline`, debounced 300 ms, serialised one-in-flight.** A `useTimelinePersistence(name)` hook inside `<TimelineProvider>` runs a `createEffect` that reads `serializeTimeline(timeline)` (so it tracks every leaf), JSON-stringifies it, and ignores the **first run** (initial load should not rewrite the file the user just loaded — use the `defer: true` form of `on`). On change: clear any pending timer, schedule a 300 ms timeout; when it fires, `await writeTimeline(name, json)` — if a write is already in flight, queue the latest JSON and fire again on completion. Errors surface via a one-line aquamarine banner above the ruler ("Timeline save failed — retry"); no toast system yet. The `PluginError` body from session 06 includes valibot paths — show `err.message` and log the body.
6. **No round-trip file-watch in v1.** The plugin never pushes `timeline.json` changes back to the browser. If a user hand-edits the file while the studio is running, their edit gets clobbered by the next debounced save. Documented in `features/timeline/CLAUDE.md` as a known caveat; a plugin → websocket broadcast is the session 06 follow-up and is deferred until we actually hit it.
7. **Clip drag = translate the whole clip, preserving duration.** `start += dt; end += dt` under the constraint `start >= 0 && end <= scene.meta.duration`. No collision handling — overlapping clips within a track are already a documented first-wins case (session 03). No snap-to-anything in v1; session 08 adds snap + grid. `moveClip(trackId, clipId, newStart)` is the single mutation action on the store; session 08's trim/split will add `resizeClipLeft`, `resizeClipRight`, etc.
8. **Keyframes render but don't drag.** Rendered as 8 px aquamarine diamonds above the clip centreline at each keyframe's clip-local time; hover gets a tooltip showing `time` (absolute) + `value` + easing. Dragging them is the natural session-08 follow-up (it's the same pointer helper + a different mutation), but shipping it this session blows scope.
9. **Ruler owns the seek interaction; clip row owns the move interaction.** Playhead drag is rooted in the ruler element (big hit target, conventional UX). Clicking the ruler seeks; dragging within the ruler continues to seek on move. Clicking empty track space deselects the current clip (view state). This keeps interactions spatially separated — no mode flags.
10. **No pause-on-scrub.** Spec mentioned pausing during playhead drag; rejected — seek mid-play is useful for previewing the currently-playing animation at offsets. `playback.seek()` already handles the anchor reset from session 03.
11. **Aquamarine restraint.** Accent appears on: ruler tick at `playback.time()`, playhead line, hovered/selected clip border, keyframe diamonds. Clip fills stay neutral (graphite tint per track row parity). Consistent with `feedback_kutkut_visual_preferences.md`.
12. **Zoom centres on cursor.** On `wheel` with `ctrlKey || metaKey`: `zoomNext = clamp(zoom * (1 - e.deltaY / 500), 40, 400); origin = cursorTime - (cursorPx / zoomNext)`. Plain `wheel` (no modifier): `origin += e.deltaX / zoom`. Trackpad gives both axes; mice give one. Page never scrolls — `preventDefault()` on the wheel handler.

### Module layout (new + changed)

```
apps/studio/src/
├── features/
│   ├── timeline/                       # NEW slice
│   │   ├── CLAUDE.md
│   │   ├── TimelineProvider.tsx
│   │   ├── TimelineView.tsx            # composes Ruler + TrackRow list
│   │   ├── Ruler.tsx                   # ticks + playhead + seek
│   │   ├── TrackRow.tsx                # one row; renders Clips
│   │   ├── Clip.tsx                    # clip rect + drag handler + keyframes
│   │   ├── Keyframe.tsx                # diamond marker + tooltip
│   │   ├── context.ts                  # TimelineContext, useTimeline()
│   │   ├── store.ts                    # createTimelineStore(), mutations
│   │   ├── persistence.ts              # useTimelinePersistence(name)
│   │   ├── mapping.ts                  # pure math (time ↔ px, tick step)
│   │   ├── mapping.test.ts             # pure unit tests
│   │   ├── interaction.ts              # startPointerDrag helper
│   │   └── index.ts
│   └── preview/
│       ├── PreviewHost.tsx             # drops `timeline` prop; reads context
│       └── CLAUDE.md                   # updated: timeline now comes from TimelineContext
├── App.tsx                             # mounts <TimelineProvider> inside <PlaybackProvider>, renders <TimelineView />
└── styles.css                          # adds .tl-* rules for ruler / row / clip / keyframe
```

### Core shapes

```ts
// features/timeline/context.ts
import type { Accessor, Setter } from "solid-js";
import type { Store } from "solid-js/store";
import type { Timeline } from "@kut-kut/engine";

export type TimelineView = {
  zoom: number;       // px per second
  origin: number;     // seconds shown at the left edge of the strip
  selection: string | null;  // clipId
};

export type TimelineContextValue = {
  name: Accessor<string>;
  duration: Accessor<number>;
  timeline: Store<Timeline>;
  view: Store<TimelineView>;
  setView: Setter<TimelineView>;
  moveClip: (trackId: string, clipId: string, newStart: number) => void;
  selectClip: (clipId: string | null) => void;
  saveState: Accessor<"idle" | "pending" | "saving" | "error">;
  saveError: Accessor<Error | null>;
};
```

```ts
// features/timeline/mapping.ts
export type MappingView = { zoom: number; origin: number };
export const timeToPx = (t: number, v: MappingView): number => (t - v.origin) * v.zoom;
export const pxToTime = (px: number, v: MappingView): number => v.origin + px / v.zoom;
export const pickTickStep = (pxPerSec: number): number => {
  // returns one of 10, 5, 2, 1, 0.5, 0.2, 0.1 so ticks sit ≥ 48 px apart
};
```

```ts
// features/timeline/store.ts
export const createTimelineStore = (initial: Timeline) => {
  const [timeline, setTimeline] = createStore<Timeline>(initial);
  const moveClip: TimelineContextValue["moveClip"] = (trackId, clipId, newStart) => {
    setTimeline("tracks", (t) => t.id === trackId, "clips", (c) => c.id === clipId, (clip) => {
      const duration = clip.end - clip.start;
      return { ...clip, start: newStart, end: newStart + duration };
    });
  };
  return { timeline, setTimeline, moveClip };
};
```

```ts
// features/timeline/persistence.ts
export const useTimelinePersistence = (name: Accessor<string>, timeline: Store<Timeline>) => {
  const [saveState, setSaveState] = createSignal<"idle" | "pending" | "saving" | "error">("idle");
  const [saveError, setSaveError] = createSignal<Error | null>(null);

  let pendingJson: TimelineJSON | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  const flush = async () => {
    if (pendingJson === null || inFlight) return;
    const json = pendingJson;
    pendingJson = null;
    inFlight = true;
    setSaveState("saving");
    try {
      await writeTimeline(name(), json);
      setSaveState(pendingJson ? "pending" : "idle");
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
      setSaveState("error");
    } finally {
      inFlight = false;
      if (pendingJson) queueMicrotask(flush);
    }
  };

  createEffect(
    on(
      () => serializeTimeline(timeline),
      (json) => {
        pendingJson = json;
        setSaveState("pending");
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 300);
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    if (timer) clearTimeout(timer);
    if (pendingJson) flush();  // fire-and-forget final save on teardown
  });

  return { saveState, saveError };
};
```

```ts
// features/timeline/interaction.ts
export type PointerDragHandlers = {
  onMove: (dx: number, dy: number, e: PointerEvent) => void;
  onEnd?: (e: PointerEvent) => void;
  onCancel?: () => void;
};
export const startPointerDrag = (e: PointerEvent, handlers: PointerDragHandlers): () => void;
```

### Interaction details

- **Ruler**
  - `pointerdown` on the ruler: seek to `pxToTime(e.offsetX, view)` (clamped to `[0, duration]`), start drag; `pointermove` continues to seek on pointer x; `pointerup` ends.
  - Cursor hover shows a faint vertical line + time label above the hovered second.
- **Clip**
  - `pointerdown` anywhere on the clip body (not on a keyframe): start drag; capture `startStart = clip.start`, `startPx = e.clientX`.
  - `pointermove`: `delta = (e.clientX - startPx) / zoom`; new start = `clamp(startStart + delta, 0, duration - (clip.end - clip.start))`; call `moveClip`.
  - `pointerup`: commit; no intermediate snapshots — Solid store mutation is already the source of truth.
  - Clicking without moving (< 3 px threshold) selects the clip.
- **Keyframe**
  - `title`/`data-*` used by a tooltip element rendered above the track row when hovered. No drag this session — `pointer-events: none` would block the tooltip, so instead `pointerdown` just calls `stopPropagation()` (so the clip doesn't pick up a drag start) and does nothing else.
- **Wheel**
  - `e.preventDefault()` always.
  - `ctrlKey || metaKey`: zoom (cursor-anchored); `else`: pan horizontally.

### Playhead

Visual: 1 px aquamarine line, 10 × 14 px triangular head at top. Positioned at `timeToPx(playback.time(), view)` — skipped when outside the visible range (`< 0` or `> width`). Animated by `createEffect(() => el.style.transform = translateX(${...})` so RAF isn't needed — Solid re-runs at playback tick frequency.

### App composition

```
<ProjectProvider>
  <Show bundle keyed>
    {(b) => (
      <PlaybackProvider duration={b.scene.meta.duration}>
        <PlaybackHotkeys />
        <TimelineProvider name={b.name} duration={b.scene.meta.duration} timeline={b.timeline}>
          <Shell />  // preview + timeline both read the timeline context
        </TimelineProvider>
      </PlaybackProvider>
    )}
```

`<Shell />`'s `.app-timeline` region replaces today's hardcoded ruler placeholder with `<TimelineView />`. `<PreviewHost>` drops its `timeline` prop and does `const t = useTimeline(); applyTimeline(props.scene, t.timeline, time)`.

### HMR + lifecycle

- Project switch: the whole `<Show bundle keyed>` subtree remounts → old `TimelineProvider` disposes (persistence's `onCleanup` runs; final save flushes if there's a pending change), new provider mounts with the new timeline store. No leaks.
- Scene HMR: same — `bundle` identity changes, subtree remounts.
- Timeline JSON on disk: not watched. External edits are lost on next save. Documented.

### Public surface

Engine: no new exports. Studio: everything internal to `features/timeline/`; `useTimeline()` is the single entry.

## Tasks

1. [x] **Feature scaffold.** Create `features/timeline/` with `context.ts`, `store.ts`, `mapping.ts`, `index.ts` (barrel), and a skeleton `CLAUDE.md` capturing ownership (this provider owns the store; `ProjectProvider` stays plain) and the no-file-watch caveat. Wire `<TimelineProvider>` inside `<PlaybackProvider>` in `App.tsx` with no UI yet. `bun run typecheck` clean. ~25 min.
2. [x] **Pure mapping + tests.** Implement `timeToPx`, `pxToTime`, `pickTickStep` in `mapping.ts`; add `mapping.test.ts` covering round-trip, clamp behaviour, and tick-step thresholds (`pxPerSec = 50 → step 1s`, `150 → 0.5s`, etc.). `bun test` green. ~15 min.
3. [x] **Persistence hook.** Implement `useTimelinePersistence` in `persistence.ts` with the debounce + single-flight + defer-first behaviour from the Design. Mount it inside `<TimelineProvider>`; expose `saveState`/`saveError` via context. Manually verify: edit the example's `timeline.json` on disk, reload, make a change in a Solid devtools inspector (or temporarily a debug button) → file updates after 300 ms. ~20 min.
4. [x] **Pointer-drag helper + ruler with playhead.** Build `interaction.ts#startPointerDrag`, `Ruler.tsx`, and the playhead overlay. Click seeks; drag seeks. Playhead tracks `playback.time()` via `createEffect` writing `style.transform`. Wheel handler on the strip container for zoom / pan (per Design). Wire `<Ruler />` into `<TimelineView />`. Verify in browser: clicking ruler seeks preview; playhead follows playback; ctrl+wheel zooms centred on cursor; plain wheel pans. ~35 min.
5. [x] **Track rows + clips + keyframes.** Build `TrackRow.tsx`, `Clip.tsx`, `Keyframe.tsx`. Render one row per track, lay out clips at `timeToPx`, render keyframe diamonds on top, hover tooltip on keyframes. Clip drag via `startPointerDrag` → `moveClip`. Click-without-drag selects. Add CSS rules under `.tl-*` in `styles.css` respecting the aquamarine palette. Verify in browser: rotation/x/y clips render, keyframes visible, drag a clip → preview animation offset shifts in real time, `projects/example/timeline.json` on disk updates 300 ms after mouseup. ~35 min.
6. [x] **Preview rewiring + verification sweep.** Drop `timeline` prop from `<PreviewHost>`; read from `useTimeline()`. Update `features/preview/CLAUDE.md` (timeline source line). Run `bun run typecheck`, `bun run lint`, `bun test`. Manual check: external `timeline.json` edit during dev gets overwritten on next GUI change (documented caveat, not a bug); error banner appears when the plugin returns 400 (force by posting an invalid timeline temporarily, or by editing the schema check). Fill Outcome. ~15 min.

## Non-goals

- **Creating / deleting tracks, clips, or keyframes.** Inspector + add-menu lands in session 08.
- **Dragging keyframe time or value.** Natural extension, but the same pointer helper + a `moveKeyframe` mutation = session 08.
- **Trim / split clips (drag clip edges to resize, blade tool to split).** Needs a more nuanced interaction model; session 08.
- **Snapping (to playhead, to other clips, to grid).** Session 08 with a snap-manager that other features can register against.
- **Multi-select, copy/paste, marquee select.** Session 08's inspector + command store.
- **Undo/redo.** Session 08's command store. Until then, clip moves are destructive and the file update is the source of truth.
- **Audio waveforms on the timeline.** Session 10 adds an audio track type with its own row renderer.
- **Caption / subtitle track UI.** Session 12.
- **Timeline JSON hot-reload from external edits.** Needs a plugin → websocket push; out of scope. Known caveat: hand-edits to `timeline.json` while studio is running get clobbered.
- **Virtualization / performance passes for huge timelines.** Per `plans/overview.md` budgets, ~6 tracks × 20 clips × 10 keyframes fits in plain arrays + DOM nodes. If it doesn't, revisit after we hit it.
- **Playhead snap or frame-stepping.** Continuous seconds per session 03's clock.
- **Bun-test coverage for UI interactions.** Per `feedback_ui_verification.md`, UI gets manual verification. Only `mapping.ts` (and optionally `interaction.ts`) get unit tests.
- **New ADR.** Design choices above are session-local. If the reactive-timeline store grows into a generalised command surface (undo/redo), write the ADR at session 08.

## Verification

- `bun run dev` starts cleanly. Example project loads; bottom strip shows three rows (`transform.rotation`, `transform.x`, `transform.y`) with clips and keyframe diamonds.
- **Ruler + playhead:**
  - Tick labels rescale as zoom changes (ctrl+wheel on the strip).
  - Click the ruler at t ≈ 2 s; preview jumps, timecode updates.
  - Press Space; playhead animates across and stops at 4 s (`onEnd: "pause"` from session 05 unchanged).
  - Drag the playhead head while playing; preview scrubs and keeps playing on release.
- **Zoom / pan:**
  - Ctrl+wheel centred on a specific tick — that tick stays under the cursor as zoom changes.
  - Plain wheel pans horizontally; timeline contents translate without distortion.
  - Zoom clamps at `[40, 400]` px/s (no infinite zoom).
- **Clip drag:**
  - Drag the rotation clip right by ~1 s; the rect's rotation visibly lags by ~1 s on the preview (because t=0 now maps to clip-local t=−1 → pre-first-keyframe hold).
  - Release; within ~300 ms `projects/example/timeline.json` on disk shows `clips[0].start ≈ 1`, `end ≈ 5`. (Revert after verifying.)
  - Try to drag a clip past `duration`; it stops at the right edge.
- **Persistence:**
  - Multiple rapid drags coalesce into one plugin POST (DevTools Network).
  - Save banner shows `pending → saving → idle` transitions (eyeball in a dev-only debug readout, or just watch the network tab).
  - Error banner appears if the plugin returns 400 (force by temporarily editing the example `timeline.json` to something invalid, then immediately doing a drag — schema validation on POST should reject).
- **Keyframe tooltip:** Hover a keyframe diamond; tooltip reads e.g. `t=2.00s · value=600 · easing=ease-in-out-cubic`.
- **Selection:** Click a clip; aquamarine border persists. Click empty track space; border clears.
- `bun run typecheck`, `bun run lint`, `bun test` all green. New tests: `mapping.test.ts`.
- **Manual check:** reload with `?project=example` — URL state + timeline edits persist across reloads.
- **Manual check:** project switch (when there's a second project — optional) tears down the provider without leaked handlers. For now, verify with `bun run dev` console that no rAF/observer warnings appear.
