import type { PlaybackState } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";

export type PlaybackContextValue = {
	time: Accessor<number>;
	state: Accessor<PlaybackState>;
	duration: Accessor<number>;
	play: () => void;
	pause: () => void;
	toggle: () => void;
	restart: () => void;
	seek: (t: number) => void;
};

export const PlaybackContext = createContext<PlaybackContextValue>();

export const usePlayback = (): PlaybackContextValue => {
	const ctx = useContext(PlaybackContext);
	if (!ctx) throw new Error("usePlayback must be used inside <PlaybackProvider>");
	return ctx;
};
