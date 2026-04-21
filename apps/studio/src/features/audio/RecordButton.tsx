import { Mic, Square } from "lucide-solid";
import { type JSX, Show } from "solid-js";
import { useAudio } from "./context.ts";

const formatElapsed = (seconds: number): string => {
	const total = Math.max(0, Math.floor(seconds));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const RecordButton = (): JSX.Element => {
	const audio = useAudio();

	const onClick = async (): Promise<void> => {
		const state = audio.recordState();
		try {
			if (state === "recording") await audio.stopRecording();
			else if (state === "idle" || state === "error") await audio.startRecording();
		} catch (err) {
			console.error("[audio] record failed", err);
		}
	};

	const recording = (): boolean => audio.recordState() === "recording";
	const processing = (): boolean => audio.recordState() === "processing";
	const requesting = (): boolean => audio.recordState() === "requesting";
	const disabled = (): boolean => !audio.recordSupported() || processing() || requesting();

	const label = (): string => {
		if (!audio.recordSupported()) return "Recording unsupported in this browser";
		if (requesting()) return "Waiting for microphone permission…";
		if (recording()) return "Stop recording";
		if (processing()) return "Processing recording…";
		return "Record voiceover";
	};

	const text = (): string => {
		if (recording()) return formatElapsed(audio.recordElapsed());
		if (processing()) return "Processing…";
		if (requesting()) return "Requesting…";
		return "Record";
	};

	return (
		<button
			type="button"
			class={`tl-record-btn ${recording() ? "tl-record-btn--on" : ""}`}
			onClick={onClick}
			disabled={disabled()}
			title={label()}
			aria-label={label()}
			aria-pressed={recording()}
		>
			<Show when={recording()} fallback={<Mic size={12} strokeWidth={2.25} aria-hidden="true" />}>
				<span class="tl-record-btn__dot" aria-hidden="true" />
				<Square size={10} strokeWidth={2.5} aria-hidden="true" />
			</Show>
			<span class="tl-record-btn__text">{text()}</span>
		</button>
	);
};

export const RecordError = (): JSX.Element => {
	const audio = useAudio();
	return (
		<Show when={audio.recordState() === "error" && audio.recordError()}>
			<div class="tl-save-banner" role="status">
				Recording failed — {audio.recordError()?.message ?? "unknown error"}
			</div>
		</Show>
	);
};
