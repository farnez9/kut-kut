import type { Timeline } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";
import type { SetStoreFunction, Store } from "solid-js/store";

export type TimelineView = {
	zoom: number;
	origin: number;
	selection: string | null;
};

export type TimelineSaveState = "idle" | "pending" | "saving" | "error";

export type TimelineContextValue = {
	name: Accessor<string>;
	duration: Accessor<number>;
	timeline: Store<Timeline>;
	view: Store<TimelineView>;
	setView: SetStoreFunction<TimelineView>;
	moveClip: (trackId: string, clipId: string, newStart: number) => void;
	selectClip: (clipId: string | null) => void;
	saveState: Accessor<TimelineSaveState>;
	saveError: Accessor<Error | null>;
};

export const TimelineContext = createContext<TimelineContextValue>();

export const useTimeline = (): TimelineContextValue => {
	const ctx = useContext(TimelineContext);
	if (!ctx) throw new Error("useTimeline must be used inside <TimelineProvider>");
	return ctx;
};
