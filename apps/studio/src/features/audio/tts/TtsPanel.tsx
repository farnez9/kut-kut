import type { TtsProvider, TtsVoice } from "@kut-kut/engine";
import { createEffect, createSignal, For, type JSX, on, Show } from "solid-js";
import { usePlayback } from "../../playback/index.ts";
import { useAudio } from "../context.ts";
import { extensionForMime, makeTtsFilename } from "./filename.ts";
import { getTtsProviders } from "./providers.ts";

type GenerateState = "idle" | "working" | "error";
type ModelState = "ready" | "cold" | "loading" | "error";

const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const TtsPanel = (props: { onClose: () => void }): JSX.Element => {
	const audio = useAudio();
	const playback = usePlayback();
	const providers = getTtsProviders();

	const [providerId, setProviderId] = createSignal(providers[0]?.id ?? "");
	const [voiceId, setVoiceId] = createSignal<string>("");
	const [voices, setVoices] = createSignal<TtsVoice[]>([]);
	const [voicesLoading, setVoicesLoading] = createSignal(false);
	const [text, setText] = createSignal("");
	const [previewing, setPreviewing] = createSignal(false);
	const [generateState, setGenerateState] = createSignal<GenerateState>("idle");
	const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
	const [modelState, setModelState] = createSignal<ModelState>("ready");
	const [loadedBytes, setLoadedBytes] = createSignal(0);
	const [totalBytes, setTotalBytes] = createSignal(0);

	let cancelPreview: (() => void) | null = null;

	const currentProvider = (): TtsProvider | undefined =>
		providers.find((p) => p.id === providerId());

	createEffect(
		on(providerId, (id) => {
			const provider = providers.find((p) => p.id === id);
			if (!provider) {
				setVoices([]);
				setVoiceId("");
				setModelState("ready");
				return;
			}
			setModelState(provider.warmUp ? "cold" : "ready");
			setLoadedBytes(0);
			setTotalBytes(0);
			setVoicesLoading(true);
			setErrorMessage(null);
			provider
				.voices()
				.then((list) => {
					setVoices(list);
					setVoiceId((current) => {
						if (current && list.some((v) => v.id === current)) return current;
						return list[0]?.id ?? "";
					});
				})
				.catch((err: unknown) => {
					setVoices([]);
					setVoiceId("");
					setErrorMessage(err instanceof Error ? err.message : String(err));
				})
				.finally(() => setVoicesLoading(false));
		}),
	);

	const ensureWarm = async (provider: TtsProvider): Promise<boolean> => {
		if (!provider.warmUp || modelState() === "ready") return true;
		if (modelState() === "loading") return false;
		setModelState("loading");
		setLoadedBytes(0);
		setTotalBytes(0);
		setErrorMessage(null);
		try {
			await provider.warmUp((progress) => {
				setLoadedBytes(progress.loaded);
				setTotalBytes(progress.total);
			});
			setModelState("ready");
			return true;
		} catch (err) {
			setModelState("error");
			setErrorMessage(err instanceof Error ? err.message : String(err));
			return false;
		}
	};

	const stopPreview = (): void => {
		if (cancelPreview) {
			cancelPreview();
			cancelPreview = null;
		}
		setPreviewing(false);
	};

	const onPreview = async (): Promise<void> => {
		const provider = currentProvider();
		if (!provider?.preview) return;
		if (previewing()) {
			stopPreview();
			return;
		}
		const trimmed = text().trim();
		if (trimmed.length === 0) return;
		setErrorMessage(null);
		const warm = await ensureWarm(provider);
		if (!warm) return;
		try {
			cancelPreview = provider.preview(
				{ text: trimmed, voiceId: voiceId() || undefined },
				{
					onEnded: () => {
						cancelPreview = null;
						setPreviewing(false);
					},
					onError: (err) => {
						cancelPreview = null;
						setPreviewing(false);
						setErrorMessage(err.message);
					},
				},
			);
			setPreviewing(true);
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : String(err));
		}
	};

	const onGenerate = async (): Promise<void> => {
		const provider = currentProvider();
		if (!provider?.synthesize) return;
		const trimmed = text().trim();
		if (trimmed.length === 0) return;
		stopPreview();
		setErrorMessage(null);
		const warm = await ensureWarm(provider);
		if (!warm) return;
		setGenerateState("working");
		const startAt = playback.time();
		try {
			const { bytes, mime } = await provider.synthesize({
				text: trimmed,
				voiceId: voiceId() || undefined,
			});
			const ext = extensionForMime(mime);
			const filename = makeTtsFilename(new Date(), provider.id, ext);
			const file = new File([bytes], filename, { type: mime });
			await audio.ingestAudioFile(file, startAt);
			setGenerateState("idle");
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : String(err));
			setGenerateState("error");
		}
	};

	const isBusy = (): boolean => modelState() === "loading" || generateState() === "working";

	const canPreview = (): boolean => {
		const provider = currentProvider();
		return !!provider?.canPreview && text().trim().length > 0 && !isBusy();
	};

	const canGenerate = (): boolean => {
		const provider = currentProvider();
		return !!provider?.canSynthesize && text().trim().length > 0 && !isBusy();
	};

	const progressPercent = (): number => {
		const total = totalBytes();
		if (total <= 0) return 0;
		return Math.min(100, Math.round((loadedBytes() / total) * 100));
	};

	return (
		<div class="tts-panel" role="dialog" aria-label="Text to speech">
			<div class="tts-panel__header">
				<span class="tts-panel__title">Text to speech</span>
				<button
					type="button"
					class="tts-panel__close"
					onClick={() => {
						stopPreview();
						props.onClose();
					}}
					aria-label="Close TTS panel"
				>
					×
				</button>
			</div>
			<div class="tts-panel__row">
				<label class="tts-panel__field">
					<span class="tts-panel__label">Provider</span>
					<select
						value={providerId()}
						onChange={(e) => setProviderId(e.currentTarget.value)}
						class="tts-panel__select"
					>
						<For each={providers}>{(p) => <option value={p.id}>{p.label}</option>}</For>
					</select>
				</label>
				<label class="tts-panel__field">
					<span class="tts-panel__label">Voice</span>
					<select
						value={voiceId()}
						onChange={(e) => setVoiceId(e.currentTarget.value)}
						class="tts-panel__select"
						disabled={voicesLoading() || voices().length === 0}
					>
						<Show
							when={voices().length > 0}
							fallback={<option value="">{voicesLoading() ? "Loading…" : "No voices"}</option>}
						>
							<For each={voices()}>{(v) => <option value={v.id}>{v.label}</option>}</For>
						</Show>
					</select>
				</label>
			</div>
			<textarea
				class="tts-panel__textarea"
				value={text()}
				onInput={(e) => setText(e.currentTarget.value)}
				placeholder="Type text to synthesize…"
				rows={4}
			/>
			<div class="tts-panel__actions">
				<button
					type="button"
					class="tl-import-btn"
					onClick={onPreview}
					disabled={!canPreview() && !previewing()}
					title={previewing() ? "Stop preview" : "Preview with selected voice"}
				>
					{previewing() ? "Stop preview" : "Preview"}
				</button>
				<button
					type="button"
					class="tl-import-btn tts-panel__generate"
					onClick={onGenerate}
					disabled={!canGenerate()}
					title="Synthesize and add as audio track at playback time"
				>
					{generateState() === "working" ? "Generating…" : "Generate"}
				</button>
			</div>
			<Show when={modelState() === "loading"}>
				<div class="tts-panel__loader" role="status" aria-live="polite">
					<div class="tts-panel__loader-label">
						<span>Loading model…</span>
						<span>
							{totalBytes() > 0
								? `${formatBytes(loadedBytes())} / ${formatBytes(totalBytes())}`
								: formatBytes(loadedBytes())}
						</span>
					</div>
					<div class="tts-panel__loader-bar">
						<div class="tts-panel__loader-fill" style={{ width: `${progressPercent()}%` }} />
					</div>
				</div>
			</Show>
			<Show when={errorMessage()}>
				<div class="tts-panel__error" role="status">
					{errorMessage()}
				</div>
			</Show>
		</div>
	);
};
