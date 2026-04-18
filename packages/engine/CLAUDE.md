# @kut-kut/engine

Headless animation engine. Consumed by `apps/studio` today; publishable to npm tomorrow.

**This package must not import anything from `apps/studio` — ever.** If you feel the urge, the boundary is wrong: either move the code down into the engine, or keep it in the studio.

## What lives here

- **scene/** — Node, Group, Transform, Scene2DLayer, Scene3DLayer, property primitives.
- **reactive/** — Solid signal/store bindings for scene properties. Engine reactivity is Solid-native.
- **timeline/** — Timeline, Track, Clip, Keyframe, easing curves, interpolation, `PlaybackController`, time source.
- **render/** — `Renderer` interface + Pixi adapter (2D) + Three adapter (3D) + layered compositor.
- **audio/** — Audio track graph, Web Audio playback, waveform peaks, MediaRecorder wrapper.
- **tts/** — `TTSProvider` interface + WebSpeech adapter + ElevenLabs adapter.
- **export/** — WebCodecs encoder pipeline, mp4-muxer, browser download trigger.
- **project/** — Project schema, serialize/deserialize, version migrations.

## Rules

- **No DOM** beyond `HTMLCanvasElement`, `AudioContext`, `MediaRecorder`, `VideoEncoder`/`VideoDecoder`, `AudioEncoder`. No `document.querySelector`, no JSX.
- **No UI framework beyond Solid reactivity.** No JSX components live here. If you need a component, it belongs in `apps/studio`.
- **No filesystem access.** The engine doesn't read or write disk. Projects are passed in as plain objects; assets are passed in as Blobs or URLs. The studio's Vite dev plugin handles IO.
- **Peer deps:** `solid-js`. Runtime deps: `pixi.js@^8`, `three`, `mp4-muxer`. Keep the list small. Justify new deps in the session spec that introduces them.
- **Public API lives in `src/index.ts`.** Everything else is internal — studio must not deep-import.
- **Types are the contract.** Changing the project schema is a breaking change. Guard with a schema validator (zod or valibot — chosen in session 02) and write explicit migrations in `project/migrations.ts`.
- **Tests** via `bun test`. Coverage priorities: serialization roundtrip, interpolation correctness, playback-clock drift/seek, export pipeline smoke.

## What's not here yet

Most of the above is roadmap. Check `plans/overview.md` for the current session and its scope. **Don't implement ahead of the current session's spec.**
