# Session 18 — export-pipeline

**Estimated:** ~2h focused
**Depends on:** session 17 (TTS + idempotent audio scheduler), session 12 (audio core), session 04 (renderer/compositor)
**Status:** done
**Links:** ADR 0001 (WebCodecs-only), ADR 0004 (renderer/compositor), ADR 0009 (audio model)

## Goal

From the studio, the user clicks **Export** and a frame-accurate mp4 of the current project (video + audio) downloads to the browser. The pipeline lives in `@kut-kut/engine/export`: a pure orchestrator that frame-steps the scene, captures composited canvas pixels via `VideoEncoder`, mixes all audio tracks via `OfflineAudioContext` + `AudioEncoder`, and muxes with `mp4-muxer`. Studio adds an **Export** button + dialog with a progress bar and cancel. Feature-detect banner if WebCodecs is unavailable.

## Design

**Thin by design.** See ADRs 0001, 0004, 0009 for rationale.

**Engine additions:**
- `LayerRenderer.renderFrame(): void` — synchronous draw. Pixi calls `app.renderer.render(app.stage)`; Three calls `renderer.render(scene, camera)`. Existing rAF paths stay; export just skips them.
- `Compositor.composite(output: HTMLCanvasElement): void` — draws each layer canvas in z-order onto `output` with `drawImage`. Requires `renderFrame()` has been called on each layer first.
- `export/` module:
  - `mix.ts` — `mixTimelineAudio({ tracks, buffers, duration, sampleRate }): Promise<AudioBuffer>` via `OfflineAudioContext`. Respects clip `start`/`end`/`offset`/`gain`/`muted` + track `gain`/`muted`.
  - `encode.ts` — `encodeVideo` + `encodeAudio` helpers: wrap `VideoEncoder`/`AudioEncoder` with back-pressure (`await encoder.flush()` on queue ≥ N), emit chunks to a caller-supplied sink.
  - `index.ts` — `exportVideo({ scene, timeline, overlay, audioTracks, buffers, compositor, output, bitrate, signal, onProgress }): Promise<Blob>`. Orchestrates: for each frame `f` in `[0, duration·fps)`: `applyOverlay → applyTimeline(t) → each renderer.renderFrame() → compositor.composite(output) → new VideoFrame(output, {timestamp})` → `VideoEncoder.encode`. In parallel (before or after video): `mixTimelineAudio` → feed PCM chunks to `AudioEncoder`. Muxer is `mp4-muxer/Muxer` with an `ArrayBufferTarget`. Resolves the final `Blob` (mp4).
  - Cancellation via `AbortSignal`: checked once per frame + between audio chunks.
- Runtime dep: `mp4-muxer` (called out as planned in `packages/engine/CLAUDE.md`).

**Studio additions:** `features/export/`
- `<ExportButton>` — topbar, right of scene label.
- `<ExportDialog>` — opens on click, shows scene name + size + fps, a single Start button, a progress bar (`frames done / total`), and Cancel. Builds an offscreen compositor (detached div) so live preview keeps running.
- Feature-detect: if `typeof VideoEncoder === 'undefined'` or `typeof AudioEncoder === 'undefined'`, render a banner in the dialog and disable Start.
- On complete: `URL.createObjectURL(blob)` → anchor click → `.mp4` filename `<project>-<YYYYMMDD-HHmm>.mp4`.

**Non-obvious:** Pixi and Three each render to their own canvas. Export composites stacked canvases onto one output canvas per frame, then hands that output to `VideoFrame`. This preserves the live preview's z-order semantics.

## Tasks

1. [x] Install `mp4-muxer` in the engine package; add `renderFrame(): void` to `LayerRenderer` type + Pixi + Three impls; add `Compositor.composite(output)` using z-ordered `drawImage`. Export both from the engine public entry.
2. [x] Engine `export/mix.ts` + unit test: mix two short audio clips on two tracks via `OfflineAudioContext`, assert peak levels match expected gain/offset math. (May require a tiny helper to generate test sine-wave `AudioBuffer`s.)
3. [x] Engine `export/encode.ts`: `encodeVideoStream` + `encodeAudioStream` — pure orchestrators that take a frame-iterator / pcm-iterator and push to encoders with back-pressure. No muxer wiring yet.
4. [x] Engine `export/index.ts`: `exportVideo({...})` top-level — builds compositor frame loop + audio mix, wires both encoders to an `mp4-muxer` `Muxer` + `ArrayBufferTarget`, returns `Blob`. Progress callback every N frames; `AbortSignal` polled per frame.
5. [x] Studio `features/export/`: `<ExportButton>` in topbar, `<ExportDialog>` with feature-detect banner + progress bar + cancel + download-on-complete. Builds its own offscreen compositor from the live scene + timeline + overlay + audio buffers.
6. [x] Smoke-test: export the `projects/example/` scene end-to-end (1–2 s clip with audio if simple), confirm the downloaded mp4 plays in the browser / QuickTime. _(Deferred to user — requires Chromium + user interaction. Automated green lights: typecheck, lint, 243 tests.)_

## Non-goals

- **Aspect presets / vertical mode** — session 19.
- **Resolution or bitrate presets** in the dialog — ship one sane default (e.g. 8 Mbps, 48 kHz stereo AAC). User-facing quality controls can follow.
- **Web Worker off-thread export.** Keep it on the main thread for v1; the preview degrades during export and that's fine.
- **Export of a sub-range** (in/out marks). Always export `[0, scene.meta.duration)`.
- **Caption / subtitle burn-in.** Captions already render in the DOM overlay; embedding them into the video is a follow-up.
- **Graceful partial mp4 on cancel.** Cancel aborts and discards — no partial file.
- **GPU-shared compositor.** Stacked canvases stay; the Pixi/Three `GPUDevice` share is still the open question flagged in overview.

## Verification

- `bun run typecheck`, `bun run lint`, `bun test` via the `test-runner` sub-agent — green.
- Audio-mix unit test in `packages/engine/src/export/mix.test.ts` asserts gain/offset correctness.
- Manual: click Export on `projects/example/`, confirm progress advances, cancel aborts promptly, successful export produces a playable `.mp4` matching scene duration with audio audible.
- Feature-detect path: tested by temporarily aliasing `globalThis.VideoEncoder = undefined` in devtools — banner renders, Start disabled.

---

At wrap-up, append one line summarising what shipped to `plans/overview.md`'s **Progress log** and update the **Current state** paragraph. Do not add an Outcome section here.
