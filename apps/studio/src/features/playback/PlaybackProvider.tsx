import { createPlaybackController } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { onCleanup } from "solid-js";
import { PlaybackContext, type PlaybackContextValue } from "./context.ts";

export type PlaybackProviderProps = {
	duration: number;
	children: JSX.Element;
};

export const PlaybackProvider = (props: PlaybackProviderProps): JSX.Element => {
	const controller = createPlaybackController({ duration: props.duration });
	onCleanup(() => controller.dispose());

	const value: PlaybackContextValue = {
		time: controller.time,
		state: controller.state,
		duration: () => props.duration,
		play: controller.play,
		pause: controller.pause,
		toggle: () => {
			if (controller.state() === "playing") controller.pause();
			else controller.play();
		},
		restart: controller.restart,
		seek: controller.seek,
		controller,
	};

	return <PlaybackContext.Provider value={value}>{props.children}</PlaybackContext.Provider>;
};
