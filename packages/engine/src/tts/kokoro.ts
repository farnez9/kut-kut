import type {
	TtsPreviewOptions,
	TtsProvider,
	TtsRequest,
	TtsResult,
	TtsVoice,
	TtsWarmUpProgress,
} from "./types.ts";
import { floatPcmToWav } from "./wav.ts";

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE_ID = "af_bella";
const DEFAULT_DTYPE = "q8";

type KokoroVoiceSpec = { id: string; label: string };

// Canonical voicepack list from the Kokoro-82M-v1.0 model card.
const VOICES: readonly KokoroVoiceSpec[] = [
	{ id: "af_heart", label: "Heart (American female)" },
	{ id: "af_alloy", label: "Alloy (American female)" },
	{ id: "af_aoede", label: "Aoede (American female)" },
	{ id: "af_bella", label: "Bella (American female)" },
	{ id: "af_jessica", label: "Jessica (American female)" },
	{ id: "af_kore", label: "Kore (American female)" },
	{ id: "af_nicole", label: "Nicole (American female)" },
	{ id: "af_nova", label: "Nova (American female)" },
	{ id: "af_river", label: "River (American female)" },
	{ id: "af_sarah", label: "Sarah (American female)" },
	{ id: "af_sky", label: "Sky (American female)" },
	{ id: "am_adam", label: "Adam (American male)" },
	{ id: "am_echo", label: "Echo (American male)" },
	{ id: "am_eric", label: "Eric (American male)" },
	{ id: "am_fenrir", label: "Fenrir (American male)" },
	{ id: "am_liam", label: "Liam (American male)" },
	{ id: "am_michael", label: "Michael (American male)" },
	{ id: "am_onyx", label: "Onyx (American male)" },
	{ id: "am_puck", label: "Puck (American male)" },
	{ id: "bf_alice", label: "Alice (British female)" },
	{ id: "bf_emma", label: "Emma (British female)" },
	{ id: "bf_isabella", label: "Isabella (British female)" },
	{ id: "bf_lily", label: "Lily (British female)" },
	{ id: "bm_daniel", label: "Daniel (British male)" },
	{ id: "bm_fable", label: "Fable (British male)" },
	{ id: "bm_george", label: "George (British male)" },
	{ id: "bm_lewis", label: "Lewis (British male)" },
];

type ProgressInfo = {
	status?: string;
	loaded?: number;
	total?: number;
	file?: string;
};

type RawAudio = { audio?: Float32Array; sampling_rate?: number };

type KokoroTTSInstance = {
	generate: (text: string, options?: { voice?: string }) => Promise<RawAudio>;
};

type KokoroTTSStatic = {
	from_pretrained: (
		modelId: string,
		options?: {
			dtype?: string;
			device?: string;
			progress_callback?: (info: ProgressInfo) => void;
		},
	) => Promise<KokoroTTSInstance>;
};

type KokoroModule = { KokoroTTS: KokoroTTSStatic };

const loadKokoroJs = async (): Promise<KokoroModule> =>
	(await import("kokoro-js")) as unknown as KokoroModule;

export type KokoroOptions = {
	modelId?: string;
	dtype?: string;
	device?: string;
};

export const createKokoroProvider = (options: KokoroOptions = {}): TtsProvider => {
	const modelId = options.modelId ?? KOKORO_MODEL_ID;
	const dtype = options.dtype ?? DEFAULT_DTYPE;
	const device = options.device;

	let ttsPromise: Promise<KokoroTTSInstance> | null = null;

	const getTTS = (
		onProgress?: (progress: TtsWarmUpProgress) => void,
	): Promise<KokoroTTSInstance> => {
		if (ttsPromise) return ttsPromise;
		ttsPromise = (async () => {
			const { KokoroTTS } = await loadKokoroJs();
			return KokoroTTS.from_pretrained(modelId, {
				dtype,
				device,
				progress_callback: onProgress
					? (info) => {
							if (
								info.status === "progress" &&
								typeof info.loaded === "number" &&
								typeof info.total === "number"
							) {
								onProgress({ loaded: info.loaded, total: info.total });
							}
						}
					: undefined,
			});
		})().catch((err) => {
			ttsPromise = null;
			throw err;
		});
		return ttsPromise;
	};

	const synthesize = async (req: TtsRequest, signal?: AbortSignal): Promise<TtsResult> => {
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const tts = await getTTS();
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const voice = req.voiceId ?? DEFAULT_VOICE_ID;
		const output = await tts.generate(req.text, { voice });
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const samples = output.audio;
		const sampleRate = output.sampling_rate;
		if (!(samples instanceof Float32Array) || typeof sampleRate !== "number") {
			throw new Error("Kokoro pipeline returned an unexpected output shape");
		}
		const bytes = floatPcmToWav(samples, sampleRate);
		return { bytes, mime: "audio/wav" };
	};

	return {
		id: "kokoro",
		label: "Kokoro (in-browser)",
		canPreview: true,
		canSynthesize: true,
		voices: async () => VOICES.map((v): TtsVoice => ({ id: v.id, label: v.label })),
		synthesize,
		preview: (req: TtsRequest, previewOptions?: TtsPreviewOptions) => {
			const controller = new AbortController();
			let audio: HTMLAudioElement | null = null;
			let objectUrl: string | null = null;
			let stopped = false;
			const cleanup = (): void => {
				if (audio) {
					audio.onended = null;
					audio.onerror = null;
					audio.pause();
					audio.removeAttribute("src");
					audio.load();
					audio = null;
				}
				if (objectUrl) {
					URL.revokeObjectURL(objectUrl);
					objectUrl = null;
				}
			};
			synthesize(req, controller.signal)
				.then(({ bytes, mime }) => {
					if (stopped || controller.signal.aborted) return;
					const blob = new Blob([bytes], { type: mime });
					objectUrl = URL.createObjectURL(blob);
					audio = new Audio(objectUrl);
					audio.onended = () => {
						cleanup();
						if (!stopped) previewOptions?.onEnded?.();
					};
					audio.onerror = () => {
						cleanup();
						if (!stopped) previewOptions?.onError?.(new Error("playback error"));
					};
					audio.play().catch((err: unknown) => {
						if (stopped) return;
						previewOptions?.onError?.(err instanceof Error ? err : new Error(String(err)));
					});
				})
				.catch((err: unknown) => {
					if (stopped || controller.signal.aborted) return;
					previewOptions?.onError?.(err instanceof Error ? err : new Error(String(err)));
				});
			return () => {
				stopped = true;
				controller.abort();
				cleanup();
			};
		},
		warmUp: async (onProgress) => {
			await getTTS(onProgress);
		},
	};
};
