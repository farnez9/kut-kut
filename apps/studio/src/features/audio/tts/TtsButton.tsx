import { createSignal, type JSX, Show } from "solid-js";
import { TtsPanel } from "./TtsPanel.tsx";

export const TtsButton = (): JSX.Element => {
	const [open, setOpen] = createSignal(false);

	return (
		<div class="tts-button-wrap">
			<button
				type="button"
				class={`tl-import-btn ${open() ? "tl-import-btn--on" : ""}`}
				onClick={() => setOpen((o) => !o)}
				title="Text to speech"
				aria-expanded={open()}
			>
				TTS
			</button>
			<Show when={open()}>
				<TtsPanel onClose={() => setOpen(false)} />
			</Show>
		</div>
	);
};
