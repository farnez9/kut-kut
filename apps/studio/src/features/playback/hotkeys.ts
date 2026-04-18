import { onCleanup } from "solid-js";
import { registerHotkey } from "../../lib/index.ts";
import { usePlayback } from "./context.ts";

/**
 * Wires Space → toggle play/pause, Home → restart.
 * Call inside a component that lives under <PlaybackProvider>.
 */
export const useGlobalPlaybackHotkeys = (): void => {
	const playback = usePlayback();
	const disposeSpace = registerHotkey("Space", () => playback.toggle());
	const disposeHome = registerHotkey("Home", () => playback.restart());
	onCleanup(() => {
		disposeSpace();
		disposeHome();
	});
};
