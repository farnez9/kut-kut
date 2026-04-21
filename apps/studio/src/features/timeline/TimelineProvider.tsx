import {
	type AudioTrack,
	type CaptionClip,
	type CaptionTrack,
	isAudioTrack,
	isCaptionTrack,
	isNumberTrack,
	isTrackTargetByPath,
	type Timeline,
} from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { useCommands } from "../../lib/commands/index.ts";
import {
	addAudioTrackCommand,
	addCaptionClipCommand,
	addCaptionTrackCommand,
	removeAudioTrackCommand,
	removeCaptionClipCommand,
	removeCaptionTrackCommand,
	setAudioTrackGainCommand,
	setAudioTrackMutedCommand,
} from "./commands.ts";
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
			if (!isNumberTrack(track)) continue;
			if (!track.clips.some((c) => c.id === clipId)) continue;
			return isTrackTargetByPath(track.target) ? [...track.target.nodePath] : null;
		}
		return null;
	};

	const findAudioTrack = (trackId: string): AudioTrack | null => {
		const t = store.timeline.tracks.find((tr) => tr.id === trackId);
		return t && isAudioTrack(t) ? t : null;
	};

	const addAudioTrack = (track: AudioTrack): void => {
		commands.push(addAudioTrackCommand(store.mutate, track));
	};

	const removeAudioTrack = (trackId: string): void => {
		const track = findAudioTrack(trackId);
		if (!track) return;
		commands.push(removeAudioTrackCommand(store.mutate, trackId, track));
	};

	const setAudioTrackGain = (trackId: string, next: number): void => {
		const track = findAudioTrack(trackId);
		if (!track || track.gain === next) return;
		commands.push(setAudioTrackGainCommand(store.mutate, trackId, track.gain, next));
	};

	const setAudioTrackMuted = (trackId: string, next: boolean): void => {
		const track = findAudioTrack(trackId);
		if (!track || track.muted === next) return;
		commands.push(setAudioTrackMutedCommand(store.mutate, trackId, track.muted, next));
	};

	const findCaptionTrack = (trackId: string): CaptionTrack | null => {
		const t = store.timeline.tracks.find((tr) => tr.id === trackId);
		return t && isCaptionTrack(t) ? t : null;
	};

	const addCaptionTrack = (track: CaptionTrack): void => {
		commands.push(addCaptionTrackCommand(store.mutate, track));
	};

	const removeCaptionTrack = (trackId: string): void => {
		const track = findCaptionTrack(trackId);
		if (!track) return;
		commands.push(removeCaptionTrackCommand(store.mutate, trackId, track));
	};

	const addCaptionClip = (trackId: string, clip: CaptionClip): void => {
		commands.push(addCaptionClipCommand(store.mutate, trackId, clip));
	};

	const removeCaptionClip = (trackId: string, clipId: string): void => {
		const track = findCaptionTrack(trackId);
		if (!track) return;
		const clip = track.clips.find((c) => c.id === clipId);
		if (!clip) return;
		commands.push(removeCaptionClipCommand(store.mutate, trackId, clip));
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
		addAudioTrack,
		removeAudioTrack,
		setAudioTrackGain,
		setAudioTrackMuted,
		moveAudioClip: store.moveAudioClip,
		resizeAudioClipLeft: store.resizeAudioClipLeft,
		resizeAudioClipRight: store.resizeAudioClipRight,
		addCaptionTrack,
		removeCaptionTrack,
		addCaptionClip,
		removeCaptionClip,
		moveCaptionClip: store.moveCaptionClip,
		resizeCaptionClipLeft: store.resizeCaptionClipLeft,
		resizeCaptionClipRight: store.resizeCaptionClipRight,
		setCaptionText: store.setCaptionText,
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
