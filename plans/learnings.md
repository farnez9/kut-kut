# Kut-Kut — learnings

Mistakes ledger. Append one entry per recurring mistake or non-obvious correction. Referenced from `CLAUDE.md`.

Keep entries tight — if the fix is captured elsewhere (an ADR, a feature `CLAUDE.md`), link there instead of restating it.

## Format

```
## YYYY-MM-DD — <short symptom>
**Mistake:** <what happened / what Claude did wrong>
**Fix:** <correct approach or rule of thumb>
```

---

## 2026-04-19 — Solid reactive primitives don't fire under `bun test` (SSR)

**Mistake:** Used `createEffect` / `createMemo` in engine code paths exercised by `bun test`. Reactive callbacks never ran because Bun imports Solid's SSR build, which does not evaluate reactive primitives. Tests appeared to pass with "Received: 0" no-op effects.
**Fix:** Prefer plain accessor functions over memos when the value is consumed reactively in JSX/effects anyway (they still track through the outer effect). For engine callbacks that must run in both SSR and browser, expose an explicit subscribe-style API (see `PlaybackController.onTransition`) instead of `createEffect`. Document SSR caveats in the engine's `CLAUDE.md` when adding new reactive surfaces.

## 2026-04-19 — Render tree is built once at mount

**Mistake:** Assumed `createEffect(() => applyNodeOps(scene, overlay))` would propagate structural scene changes into the compositor. Pixi/Three layer renderers iterate `layer.children` exactly once at mount; later mutations are invisible.
**Fix:** Structural overlay changes require a remount. The overlay feature exposes a `structureKey` memo and `<KeyedPreviewHost>` keys a `<Show>` on it. Don't mutate the shared authored scene — keep a scene **factory** on the bundle and rebuild via `factory() + applyNodeOps + applyOverlay` per change.
