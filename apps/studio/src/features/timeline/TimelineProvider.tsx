import type { Timeline } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { TimelineContext, type TimelineContextValue, type TimelineView } from "./context.ts";
import { useTimelinePersistence } from "./persistence.ts";
import { createTimelineStore } from "./store.ts";

export type TimelineProviderProps = {
	name: string;
	duration: number;
	timeline: Timeline;
	children: JSX.Element;
};

const INITIAL_ZOOM = 120;

export const TimelineProvider = (props: TimelineProviderProps): JSX.Element => {
	const { timeline, moveClip } = createTimelineStore(props.timeline);
	const [view, setView] = createStore<TimelineView>({
		zoom: INITIAL_ZOOM,
		origin: 0,
		selection: null,
	});

	const { saveState, saveError } = useTimelinePersistence(() => props.name, timeline);

	const value: TimelineContextValue = {
		name: () => props.name,
		duration: () => props.duration,
		timeline,
		view,
		setView,
		moveClip,
		selectClip: (id) => setView("selection", id),
		saveState,
		saveError,
	};

	return <TimelineContext.Provider value={value}>{props.children}</TimelineContext.Provider>;
};
