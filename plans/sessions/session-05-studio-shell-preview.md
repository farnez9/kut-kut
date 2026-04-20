# Session 05 — Studio: app shell + preview

**Estimated:** ~2h focused
**Depends on:** Session 02 (scene graph, Rect/Box factories), Session 03 (`PlaybackController`, `applyTimeline`), Session 04 (`createCompositor`, Pixi/Three adapters)
**Status:** done
**Links:** `apps/studio/CLAUDE.md`, `plans/decisions/0001-architecture-choices.md`, `plans/decisions/0004-renderer-compositor.md`

## Goal

End state: `bun run dev` boots the studio into a real application shell — a CSS-grid layout with a top bar, left sidebar, right sidebar, center preview region, and bottom timeline strip. The preview region mounts the engine compositor against an **in-memory demo scene** authored inside the studio (one 2D layer with a Rect, one 3D layer with a Box), drives it with a `PlaybackController`, and runs a small timeline that animates Rect/Box transforms so the renderers visibly react. Playback controls (play/pause, restart, current time readout) live in the top bar and are also reachable via hotkeys (`Space` toggles, `Home` restarts). Resizing the preview region updates the compositor. HMR on `App.tsx` or the demo-scene module disposes the compositor cleanly before remounting — no canvas leaks. This is the **first visual verification** of session 04's adapters; runtime correctness is confirmed by the user in a browser, not by automated tests.

## Design

### Scope decisions locked this session

1. **Layout via CSS grid, not a third-party panel library.** One component (`App.tsx`) owns a `grid-template-areas` map with five regions: `topbar`, `left`, `preview`, `right`, `timeline`. Sidebar widths and timeline height are fixed (`240px` / `280px` / `180px`) for v1 — resizable splitters are a session-17+ polish task. No `solid-split-pane`, no `allotment`.
2. **Demo scene lives in the studio, not the engine.** `apps/studio/src/features/preview/demo-scene.ts` exports `createDemoScene()` returning `{ scene, timeline, duration }`. Keeping the demo in the studio honors the engine's "content-agnostic, ships no templates" rule (overview.md product statement) and the CLAUDE.md rule that engine ships no JSX/content. When session 06 lands the project loader, `PreviewHost` swaps the demo source for the real project module without touching the compositor wiring.
3. **One `PreviewHost` component owns the compositor lifecycle.** Create compositor in `onMount` (with the host `<div ref>` and the scene), `await compositor.mount()`, subscribe to `playback.time()` via `createEffect` → `applyTimeline(scene, timeline, t)`, observe host size via `ResizeObserver` → `compositor.setSize(w, h)`. In `onCleanup`: cancel the resize observer, dispose the playback controller, dispose the compositor. This is the complete lifecycle contract; no other component touches the compositor.
4. **`PlaybackController` is created inside `PreviewHost` and exposed through a feature-scoped context.** A minimal `PlaybackProvider` + `usePlayback()` hook in `apps/studio/src/features/playback/` publishes `{ time, state, play, pause, restart, seek, duration }`. The top-bar `PlaybackControls` and the hotkey handler read from that context. No global store yet — the provider wraps the whole `App`, and `PreviewHost` is the single *writer*. Deliberately narrow so session 06's project-swap flow has one place to tear down and replace the controller.
5. **Hotkeys via a tiny `registerHotkey(combo, handler)` helper, not a library.** Lives in `apps/studio/src/lib/hotkeys.ts`. Listens on `window`, ignores events where `event.target` is a form element or has `isContentEditable`. Returns a disposer. `Space` → `playback.state() === "playing" ? pause() : play()`; `Home` → `restart()`. Session 08 will expand this into a real registry; for now it's 30 lines.
6. **Resize via `ResizeObserver`, debounced by `queueMicrotask`.** The compositor's `setSize(width, height)` maps to each layer renderer's canvas backing store at `devicePixelRatio`. Already the Pixi/Three adapters handle that internally; `PreviewHost` just forwards layout pixels. Resize fires at most once per frame — no RAF debouncing; `queueMicrotask` is enough because `ResizeObserver` already batches.
7. **Demo scene is readable at 1080p.** Session 04's follow-up called out that unit-sized primitives might be hard to see. Demo uses explicit starter scales: Rect at `scale: (200, 200)` in a 2D layer sized 960×540, Box positioned at `z: -3` in a 3D layer of the same size with `scale: (1.5, 1.5, 1.5)`. These are demo-scene knobs, not engine defaults.
8. **Solid-idiomatic reactivity; no manual re-renders.** `createEffect(() => applyTimeline(scene, timeline, playback.time()))` is the only wiring between playback and scene. Pixi/Three adapters pick up the property writes through their own Solid effects (session 04). No component re-mounts on time changes.

### Module layout (new)

```
apps/studio/
├── index.html                        # existing — body gets a bit of base CSS
├── src/
│   ├── App.tsx                       # rewrite: grid shell + <PlaybackProvider>
│   ├── main.tsx                      # unchanged
│   ├── ui/
│   │   ├── Button.tsx                # minimal accessible <button> wrapper
│   │   └── index.ts
│   ├── lib/
│   │   ├── hotkeys.ts                # registerHotkey(combo, handler): () => void
│   │   └── index.ts
│   ├── features/
│   │   ├── playback/
│   │   │   ├── context.ts            # createContext<PlaybackContextValue>()
│   │   │   ├── PlaybackProvider.tsx  # signals-backed store + controller lifecycle
│   │   │   ├── PlaybackControls.tsx  # ⏮ / ▶︎ / ⏸ / time readout
│   │   │   ├── hotkeys.ts            # useHotkeys() → wires Space / Home
│   │   │   └── index.ts
│   │   └── preview/
│   │       ├── PreviewHost.tsx       # ref + compositor + resize + time→applyTimeline
│   │       ├── demo-scene.ts         # createDemoScene(): { scene, timeline, duration }
│   │       └── index.ts
│   └── styles.css                    # grid rules + a handful of design tokens
└── vite.config.ts                    # unchanged (solid plugin only)
```

Feature `CLAUDE.md`s land alongside real code (studio CLAUDE.md rule). This session creates:

- `apps/studio/src/features/preview/CLAUDE.md` — lifecycle invariants (who disposes the compositor, where the demo scene lives, HMR expectations).
- `apps/studio/src/features/playback/CLAUDE.md` — the provider/context contract and the rule that `PreviewHost` is the single writer.

### Core shapes

```ts
// apps/studio/src/features/playback/context.ts
export type PlaybackContextValue = {
  time: Accessor<number>
  state: Accessor<PlaybackState>
  duration: Accessor<number>
  play: () => void
  pause: () => void
  restart: () => void
  seek: (t: number) => void
}
export const PlaybackContext = createContext<PlaybackContextValue>()
export const usePlayback = (): PlaybackContextValue => {
  const ctx = useContext(PlaybackContext)
  if (!ctx) throw new Error("usePlayback must be used inside <PlaybackProvider>")
  return ctx
}
```

```ts
// apps/studio/src/features/playback/PlaybackProvider.tsx
// Owns the PlaybackController. Duration defaults to the demo scene's duration
// (set by PreviewHost through a setter on the provider), but v1 hard-codes
// duration at provider construction via a `duration` prop. Session 06 lifts
// this into "controller per project load".
export type PlaybackProviderProps = { duration: number; children: JSX.Element }
export const PlaybackProvider: (props: PlaybackProviderProps) => JSX.Element
```

```ts
// apps/studio/src/features/preview/PreviewHost.tsx
// Reads scene + timeline from props (demo or, later, project) and wires the
// compositor to the playback context. The *only* component that mounts a
// compositor.
export type PreviewHostProps = { scene: Scene; timeline: Timeline }
export const PreviewHost: (props: PreviewHostProps) => JSX.Element
```

```ts
// apps/studio/src/features/preview/demo-scene.ts
export type DemoSceneBundle = { scene: Scene; timeline: Timeline; duration: number }
export const createDemoScene = (): DemoSceneBundle
// Internals (for reference):
// - One 2D layer 960×540, one Rect scaled to (200,200), color [1, 0.4, 0.2].
// - One 3D layer 960×540, one Box at (0, 0, -3), color [0.3, 0.6, 1].
// - Timeline duration 4s:
//     - rect.transform.rotation: 0 → 2π, easeInOut, loop via `onEnd: "loop"`
//     - rect.transform.x: -200 → 200 → -200 with two keyframes
//     - box.transform.rotation.y: 0 → 2π
//     - box.transform.position.x: -1 → 1 → -1
//   Chosen to exercise 2D rotation/translation and 3D rotation/translation in
//   both adapters; each animates via existing NumberTrack only.
```

```ts
// apps/studio/src/lib/hotkeys.ts
export type HotkeyCombo = "Space" | "Home" | (string & {})
export const registerHotkey = (combo: HotkeyCombo, handler: () => void): (() => void)
```

### CSS grid shell

```css
/* apps/studio/src/styles.css (abbreviated) */
:root { color-scheme: dark; --bg: #101114; --panel: #17191e; --border: #262a31; }
html, body, #root { height: 100%; margin: 0; background: var(--bg); color: #e6e8ee; font-family: system-ui, sans-serif; }
.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr 280px;
  grid-template-rows: 48px 1fr 180px;
  grid-template-areas:
    "topbar topbar topbar"
    "left   preview right"
    "left   timeline right";
  height: 100%;
  gap: 1px;
  background: var(--border);
}
.app-topbar { grid-area: topbar; background: var(--panel); display: flex; align-items: center; padding: 0 12px; gap: 8px; }
.app-left   { grid-area: left;    background: var(--panel); }
.app-right  { grid-area: right;   background: var(--panel); }
.app-preview{ grid-area: preview; background: #000; position: relative; overflow: hidden; }
.app-timeline{grid-area: timeline; background: var(--panel); }
```

Sidebars and timeline are empty shells this session — each contains a single `<p>` placeholder ("Scenes / Layers", "Inspector", "Timeline — session 07"). Their job here is to occupy the grid so the preview region gets the right aspect at common viewport sizes.

### HMR behavior

- `PreviewHost` disposes its compositor in `onCleanup`. Vite's HMR replaces the component instance on edit; cleanup fires before the new instance mounts. No leaked canvases.
- `demo-scene.ts` is imported eagerly. On edit: Vite invalidates the module, `PreviewHost`'s props change, Solid re-mounts with the new scene; old compositor disposes cleanly via the same cleanup path.
- `App.tsx` edits trigger a full re-render of the shell; provider and preview tear down together.

### Public surface (studio-internal)

Studio exports nothing; everything is internal modules. Engine surface unchanged.

## Tasks

1. [ ] Add `styles.css` with the CSS-grid shell, wire it into `main.tsx` via `import "./styles.css"`. Rewrite `App.tsx` to render the five-region shell with placeholder children. Confirm `bun run dev` shows the layout with a dark background and empty panels. ~15 min.
2. [ ] Build `apps/studio/src/lib/hotkeys.ts` (`registerHotkey(combo, handler) → disposer`; ignores events from inputs / contenteditable). Add `apps/studio/src/lib/index.ts` barrel. No test — covered indirectly via manual verification in task 5. ~15 min.
3. [ ] Build the playback feature: `context.ts`, `PlaybackProvider.tsx`, `PlaybackControls.tsx`, `hotkeys.ts` (wires Space/Home via `registerHotkey` inside an effect, disposes on cleanup), `index.ts` barrel, and `features/playback/CLAUDE.md`. Wire `<PlaybackProvider duration={...}>` into `App.tsx` around the shell; render `<PlaybackControls>` in the top bar. ~30 min.
4. [ ] Build `features/preview/demo-scene.ts` and a `features/preview/PreviewHost.tsx` that creates `createCompositor`, mounts it against a ref'd `<div>`, subscribes `playback.time()` → `applyTimeline(scene, timeline, t)` in a `createEffect`, observes host size with `ResizeObserver` → `compositor.setSize(w, h)`. Dispose everything in `onCleanup`. Add `features/preview/CLAUDE.md`. Render `<PreviewHost scene={demo.scene} timeline={demo.timeline} />` inside the grid's `preview` area. ~40 min.
5. [ ] Run `bun run dev`; open the studio in the browser; verify: 2D Rect renders and animates, 3D Box renders and animates, Space toggles play/pause, Home restarts, window resize keeps the preview filling its grid cell at the right DPR, HMR edit on `demo-scene.ts` hot-swaps without console errors about leaked canvases. Record findings in Outcome → Surprises. ~15 min.
6. [ ] Typecheck + lint sweep: `bun run typecheck` (engine + studio), `bun run lint`. Fix any drift. ~10 min.

## Non-goals

- **Timeline UI interactivity.** The bottom strip is an empty panel this session. Ruler, playhead drag, clips, keyframes all land in session 07.
- **Inspector panel contents.** Right sidebar is placeholder — property editors bound to selection are session 08.
- **Scene/layer browser.** Left sidebar is placeholder; it lists real projects in session 06 and scene nodes in session 08.
- **Project loader / Vite dev plugin.** The demo scene is hardcoded inside studio code. No `projects/` directory reads; session 06 owns that.
- **Resizable splitters.** Fixed-width sidebars; dragging to resize is polish (session 17+).
- **Theming / design tokens beyond a minimal dark palette.** No CSS variables ecosystem, no shadcn-equivalent, no theme switcher. Just enough for the shell to look like an app.
- **Playback scrubbing.** `seek()` exists on the controller but no scrubber UI yet — session 07 builds the playhead.
- **Keyboard shortcut registry with conflict detection.** 30-line helper today; proper registry in session 08.
- **Feature-detect banners for WebCodecs / WebSpeech.** Those kick in when the features matter (sessions 13 / 14), not here.
- **Bun-test coverage for UI components.** Per memory (`feedback_ui_verification.md`), UI correctness is verified manually by the user. This session's passing gates are typecheck + lint, not new `bun test` files. Compositor wiring (mock) was already tested in session 04.
- **Export button.** Top bar has playback controls only. Export dialog lands in session 14.
- **Audio drawer placeholder.** Not in the grid this session — audio panel arrives in session 10.

## Verification

- `bun run dev` starts the studio without errors. Browser loads, shell renders with five regions, dark theme, placeholder text in sidebars/timeline strip.
- **Preview region:** a spinning orange rectangle (2D) and a spinning blue cube (3D) are visible and animate smoothly.
- **Playback controls in the top bar:** ▶︎ button toggles to ⏸ when playing; ⏮ restarts from t=0; a time readout like `1.23s / 4.00s` updates while playing.
- **Hotkeys:** `Space` toggles play/pause when focus is on the page (not an input). `Home` restarts. No interference when a future form input is focused (test by focusing the address bar — no handler fires).
- **Resize:** resize the browser window; preview region fills its grid cell; no stretched canvas, no blurry output (DPR honored by the adapters).
- **HMR:** edit a color literal in `demo-scene.ts`, save; the preview updates in place with no full-page reload, no "canvas leaked" warnings in DevTools, no duplicated canvas elements in the preview region (inspect: exactly one 2D canvas + one 3D canvas).
- `bun run typecheck` clean across workspace.
- `bun run lint` clean.
- `bun test` still green (no new tests expected; this is a regression check).
- **Manual check:** session 04 follow-ups — (a) WebGPU path taken on Chromium, WebGL fallback clean on Safari if available; (b) Rect/Box readable at the demo's explicit scales, no "can't find the unit primitive" surprise. Record in Outcome.
