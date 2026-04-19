import { isTrackTargetByPath, type Timeline } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { useCommands } from "../../lib/commands/index.ts";
import {
	makeKeyframeId,
	TimelineContext,
	type TimelineContextValue,
	type TimelineView,
} from "./context.ts";
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
	const commands = useCommands();
	const store = createTimelineStore(props.timeline);
	const [view, setView] = createStore<TimelineView>({
		zoom: INITIAL_ZOOM,
		origin: 0,
		selection: { clipId: null, keyframeId: null, nodePath: null },
	});

	const { saveState, saveError } = useTimelinePersistence(() => props.name, store.timeline);

	const nodePathForClip = (clipId: string): string[] | null => {
		for (const track of store.timeline.tracks) {
			if (!track.clips.some((c) => c.id === clipId)) continue;
			return isTrackTargetByPath(track.target) ? [...track.target.nodePath] : null;
		}
		return null;
	};

	const value: TimelineContextValue = {
		name: () => props.name,
		duration: () => props.duration,
		timeline: store.timeline,
		view,
		setView,
		mutate: store.mutate,
		moveClip: store.moveClip,
		resizeClipLeft: store.resizeClipLeft,
		resizeClipRight: store.resizeClipRight,
		setKeyframeTime: store.setKeyframeTime,
		sortClipKeyframes: store.sortClipKeyframes,
		push: commands.push,
		undo: commands.undo,
		redo: commands.redo,
		canUndo: commands.canUndo,
		canRedo: commands.canRedo,
		selectClip: (id) =>
			setView("selection", {
				clipId: id,
				keyframeId: null,
				nodePath: id ? nodePathForClip(id) : null,
			}),
		selectKeyframe: (clipId, index) =>
			setView("selection", {
				clipId,
				keyframeId: makeKeyframeId(clipId, index),
				nodePath: nodePathForClip(clipId),
			}),
		selectNode: (nodePath) => setView("selection", { clipId: null, keyframeId: null, nodePath }),
		clearSelection: () => setView("selection", { clipId: null, keyframeId: null, nodePath: null }),
		saveState,
		saveError,
	};

	return <TimelineContext.Provider value={value}>{props.children}</TimelineContext.Provider>;
};
