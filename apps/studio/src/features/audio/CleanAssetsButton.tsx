import { Eraser } from "lucide-solid";
import { type JSX, Show } from "solid-js";
import { useAudio } from "./context.ts";

export const CleanAssetsButton = (): JSX.Element => {
	const audio = useAudio();

	const onClick = async (): Promise<void> => {
		try {
			await audio.cleanAssets();
		} catch (err) {
			console.error("[audio] clean failed", err);
		}
	};

	return (
		<button
			type="button"
			class="tl-import-btn"
			onClick={onClick}
			disabled={audio.cleanState() === "working"}
			title="Delete audio files in assets/ that no tracks reference"
			aria-label="Clean unused assets"
		>
			<Eraser size={12} strokeWidth={2.25} aria-hidden="true" />
			<span class="tl-import-btn__text">
				{audio.cleanState() === "working" ? "Cleaning…" : "Clean"}
			</span>
		</button>
	);
};

export const CleanAssetsStatus = (): JSX.Element => {
	const audio = useAudio();
	return (
		<Show when={audio.cleanMessage() !== ""}>
			<div
				class={`tl-save-banner ${audio.cleanState() === "error" ? "" : "tl-save-banner--info"}`}
				role="status"
			>
				{audio.cleanMessage()}
			</div>
		</Show>
	);
};
