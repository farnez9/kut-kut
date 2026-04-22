# Session 17 — tts-adapters-and-panel

**Estimated:** ~2h × 2 (ElevenLabs pass) + ~2h (Kokoro pivot) + ~1h (simplify to Kokoro-only) + ~1h (audio-scheduler idempotency fix)
**Depends on:** session 13 (audio provider / ingest tail), session 14 (recording → `ingestAudioFile`)
**Status:** done
**Links:**
- `apps/studio/src/features/audio/CLAUDE.md` (ingest tail contract)
- `apps/studio/CLAUDE.md`
- `apps/studio/vite/project-fs.ts` (reuse `uploadAsset` — no new endpoint)
- [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) · [Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)

## Goal

A TTS panel in the studio lets the user pick a voice, type text, preview, and generate. Generate produces bytes, uploads to `projects/<name>/assets/`, and lands as an undoable new audio track with `clip.start = playback.time()` via the shared `ingestAudioFile` tail. TTS runs **entirely in the browser** via `kokoro-js` (the Kokoro-specific wrapper around Transformers.js), with a one-time ~82 MB ONNX download that the browser caches for every subsequent click.

**No cloud providers this session.** The interface is provider-agnostic so we can add ElevenLabs / OpenAI / etc. later, but the only adapter we ship is Kokoro — keeping the studio zero-config (no API keys) and offline after first load.

**Web Speech is NOT a provider.** The browser API plays audio to the system speakers but never hands the synthesized samples back to JavaScript — there's nothing to save as a clip. Dropped from scope and from code.

## Design

### Engine: `packages/engine/src/tts/`

```ts
export type TtsRequest = { text: string; voiceId?: string };
export type TtsResult  = { bytes: ArrayBuffer; mime: string };
export type TtsVoice   = { id: string; label: string };

export type TtsPreviewOptions = {
  onEnded?: () => void;
  onError?: (err: Error) => void;
};

export type TtsWarmUpProgress = { loaded: number; total: number };

export type TtsProvider = {
  readonly id: string;                    // "kokoro" today
  readonly label: string;
  readonly canPreview: boolean;
  readonly canSynthesize: boolean;
  voices(): Promise<TtsVoice[]>;
  preview?(req: TtsRequest, options?: TtsPreviewOptions): () => void;
  synthesize?(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult>;

  // Optional warm-up hook — providers that need to download model weights
  // implement this so the UI can show a progress indicator before the first
  // synthesize() call. No-op (undefined) for providers that don't need it.
  warmUp?(onProgress?: (p: TtsWarmUpProgress) => void): Promise<void>;
};
```

Exports from engine index: `TtsProvider`, `TtsPreviewOptions`, `TtsRequest`, `TtsResult`, `TtsVoice`, `TtsWarmUpProgress`, `createKokoroProvider`, `KokoroOptions`, `floatPcmToWav`.

**Kokoro adapter** (`kokoro.ts`) — `canPreview: true`, `canSynthesize: true`. Dynamic `import("kokoro-js")` inside `warmUp` / `synthesize` so the 400 kB wrapper (and its transitive Transformers.js) only lands in memory when the user opens the TTS panel. Lazy-loads the `onnx-community/Kokoro-82M-v1.0-ONNX` model at `q8` dtype (~82 MB one-time download, cached by the browser). Hardcoded voice list (27 voices — all American + British English variants from the model card). `synthesize` runs `KokoroTTS.generate` → converts the returned `Float32Array` PCM into a WAV `ArrayBuffer` via the pure `floatPcmToWav(samples, sampleRate)` helper → returns `{ bytes, mime: "audio/wav" }`. `preview` wraps `synthesize` + `new Audio(...)` with careful handler detach in cleanup (`removeAttribute("src")` + `.load()`; never `src = ""` — that triggers a spurious `error` event). `warmUp(onProgress)` forwards kokoro-js's `progress_callback` so the UI can show a "Loading model…" bar.

Pure helpers only in the engine; no DOM beyond `Audio`/`URL.createObjectURL`. Tests: smoke-test `floatPcmToWav` (RIFF header shape, 1-second silence byte length, clamping on out-of-range values). The kokoro-js pipeline itself isn't unit-testable in bun without a headless browser, so **no integration test for Kokoro synthesis** — manual verification covers it.

**Dependency:** `kokoro-js@^1.2.0` on the engine's **optional peer** deps (`peerDependenciesMeta.optional`) + devDep for local typecheck. Not a hard runtime dep — the adapter is opt-in via dynamic import. Listed in `optimizeDeps.exclude` in `apps/studio/vite.config.ts` so Vite doesn't try to pre-bundle the ONNX runtime.

### Studio: `apps/studio/src/features/audio/tts/`

- `TtsPanel.tsx` — provider select (today: only Kokoro), voice select, textarea, Preview, Generate. Plus a **model-loading state**: before the first Preview/Generate, call `provider.warmUp(onProgress)` and show a progress strip with bytes loaded. After warm-up, cache the ready-state so subsequent clicks skip it; auto-continues to the requested action once warm.
- `providers.ts` — constructs providers at module load. Returns `[createKokoroProvider()]`.
- `TtsButton.tsx` — timeline-header toggle that mounts/unmounts the panel.
- `filename.ts` + `filename.test.ts` — `makeTtsFilename(now, providerId, ext)` → `tts-kokoro-YYYYMMDD-HHMMSS.wav`; `extensionForMime` re-exported from the shared `features/audio/mime.ts` helper.

**Generate flow:**

1. Read `playback.time()` at click → `startAt`.
2. If provider has `warmUp` and `modelState() === "cold"`: `provider.warmUp(setProgress)` with a progress strip.
3. `provider.synthesize({ text, voiceId })` → `{ bytes, mime }`.
4. Wrap as `File([bytes], makeTtsFilename(...), { type: mime })`.
5. Call `useAudio().ingestAudioFile(file, startAt)` → uploaded to `projects/<name>/assets/` → decoded → undoable `addAudioTrackCommand`.

**Preview flow:** `provider.preview(req, { onEnded, onError })` returns a disposer. Panel tracks `previewing()` state; clicking Preview again stops it. Clean shutdown detaches `onended`/`onerror` handlers before resetting the `<audio>` element to avoid spurious "playback error" callbacks.

**Secrets:** none. Kokoro runs locally.

## Tasks

### Phase A — shipped (scaffolding)

1. [x] **Engine TTS types.** `packages/engine/src/tts/{index.ts,types.ts}` + engine-index exports.
2. [x] **Studio panel scaffolding.** `features/audio/tts/{providers.ts, filename.ts, filename.test.ts, TtsPanel.tsx, TtsButton.tsx}`; `styles.css` additions; `mime.ts` shared helper; `ingestAudioFile` promoted to the public `AudioContextValue`.
3. [x] **Preview channel.** `TtsPreviewOptions { onEnded, onError }` so the Preview button un-sticks on natural end and surfaces errors inline.

### Phase B — Kokoro pivot (shipped)

4. [x] **Remove Web Speech.** Deleted `packages/engine/src/tts/webspeech.ts` + test; removed exports; removed registration; updated engine CLAUDE.md.
5. [x] **`warmUp` on `TtsProvider`.** Extended the type; added `TtsWarmUpProgress`.
6. [x] **PCM-to-WAV helper + tests.** `packages/engine/src/tts/wav.ts` exporting `floatPcmToWav(samples, sampleRate)` (mono, 16-bit PCM). Tests cover RIFF header shape, silence byte length, and clamping.
7. [x] **Kokoro adapter via `kokoro-js`.** `packages/engine/src/tts/kokoro.ts` — dynamic `import("kokoro-js")`, lazy `KokoroTTS.from_pretrained(modelId, { dtype: "q8", progress_callback })`. Initial attempt via `@huggingface/transformers`' generic `pipeline("text-to-speech", …)` failed at runtime with `Unsupported model type: style_text_to_speech_2` — pivoted to `kokoro-js` which understands the model. Hardcoded 27-voice enum (American + British). Dependency on engine package.json (optional peer + devDep); `optimizeDeps.exclude` entry in studio Vite config.
8. [x] **`<TtsPanel>` Kokoro loading state.** `modelState()` signal (`"cold" | "loading" | "ready" | "error"`). Reset on provider change. First click of Preview/Generate while cold calls `provider.warmUp(setProgress)`, renders a progress strip, then auto-continues the requested action. Buttons disabled during load.
9. [x] **Default provider is Kokoro.** `providers.ts` returns `[createKokoroProvider()]`.

### Phase C — simplify to Kokoro-only (shipped)

10. [x] **Remove ElevenLabs adapter.** After manual testing of Kokoro, decided to drop the cloud provider for this session to keep the studio zero-config. Deleted `elevenlabs.ts` + test; dropped engine exports; removed registration from `providers.ts`; deleted `.env.example`; updated `apps/studio/CLAUDE.md` to drop the `VITE_ELEVENLABS_API_KEY` note (kept a generic "future API keys go in `.env.local`" line).
11. [x] **Preview cleanup bug fix.** `audio.src = ""` after natural-end was firing a spurious `error` event → "playback error" banner. Replaced with detach `onended`/`onerror`, `removeAttribute("src")`, `audio.load()`.
12. [x] **Idempotent audio scheduler.** Generated and recorded clips sounded metallic/bassy on timeline playback (preview was fine). Root cause: `AudioPlayerHost`'s `createEffect` was firing many times per second during playback, and `createAudioPlayer.reconcile()` unconditionally called `stopAllSources()` + recreated every `AudioBufferSourceNode`. The restart clicks blurred into zipper noise. Rewrote `packages/engine/src/audio/player.ts` to key active sources by `clip.id`, force-restart only on seek / state transitions, and update clip gain via the existing `GainNode` otherwise. Added two tests (steady-state no-op; gain-only update doesn't restart).

### Wrap-up

13. [x] **Manual verification.**
    - Fresh browser profile: open the panel, hit Generate with Kokoro → progress bar, model downloads, clip lands at playhead. ✓
    - Second click (same session): no download, synth runs immediately. ✓
    - Preview finishes cleanly without a "playback error" banner. ✓
    - Generated clip plays cleanly on the timeline after the scheduler fix (no metallic/bassy artefact). ✓
14. [x] **Sub-agents at wrap-up.** `test-runner` green → `code-reviewer` → update `plans/overview.md` (Progress log edit for session 17 reflecting the Kokoro-only outcome + scheduler idempotency fix; Current state paragraph; Last updated) → flip spec `Status: done`.

## Non-goals

- Web Speech API — permanently dropped (no bytes out of the browser).
- Cloud TTS providers (ElevenLabs, OpenAI, Azure, Google, PlayHT, Cartesia). Interface accommodates them; none ship this session.
- Server-side or additional bundled TTS (Piper, Coqui, StyleTTS, XTTS).
- Voice cloning, custom voicepacks, per-project voice favorites.
- SSML, pronunciation dictionaries, prosody controls, multi-sentence chunking (Kokoro accepts longer text as-is; long passages will just be slower).
- Non-English voices in the dropdown this session — easy to add later by extending the `VOICES` table.
- Automatic caption-track generation from TTS text.
- Inspector editing of TTS metadata on existing clips.
- Pre-bundling the Kokoro model into the repo — always CDN-fetched, browser-cached.
- Fallback to a smaller `q4` quant on weak hardware — future polish if needed.
- Cancellation of an in-flight model download (user can close the tab).

## Verification

- `bun test` green (`filename.test.ts`, `wav.test.ts`).
- `bun run typecheck` green across engine + studio.
- `bun run lint` green.
- Manual per task 12.
- `projects/example/assets/` gains a `tts-kokoro-*.wav` file after Generate; `timeline.json` gains an audio track; ⌘Z removes the track.
- Network tab confirms the Kokoro ONNX files download once and reuse cache on subsequent synth calls.
