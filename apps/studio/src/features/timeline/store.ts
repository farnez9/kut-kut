import type { Clip, Timeline, Track } from "@kut-kut/engine";
import { type Accessor, createMemo } from "solid-js";
import { createStore, produce, type Store } from "solid-js/store";
import type { Command } from "./commands.ts";

export type History = {
	past: Command[];
	future: Command[];
};

export type TimelineStore = {
	timeline: Store<Timeline>;
	setTimeline: ReturnType<typeof createStore<Timeline>>[1];
	history: Store<History>;
	moveClip: (trackId: string, clipId: string, newStart: number) => void;
	resizeClipLeft: (trackId: string, clipId: string, newStart: number) => void;
	resizeClipRight: (trackId: string, clipId: string, newEnd: number) => void;
	setKeyframeTime: (trackId: string, clipId: string, index: number, newTime: number) => void;
	sortClipKeyframes: (trackId: string, clipId: string) => void;
	push: (cmd: Command) => void;
	undo: () => void;
	redo: () => void;
	canUndo: Accessor<boolean>;
	canRedo: Accessor<boolean>;
	clearHistory: () => void;
};

const HISTORY_CAP = 200;

const round = (v: number): number => Math.round(v * 1000) / 1000;

const findClipInDraft = (
	draft: Timeline,
	trackId: string,
	clipId: string,
): Clip<number> | undefined => {
	const track: Track | undefined = draft.tracks.find((t) => t.id === trackId);
	if (!track) return undefined;
	return track.clips.find((c) => c.id === clipId);
};

export const createTimelineStore = (initial: Timeline): TimelineStore => {
	const [timeline, setTimeline] = createStore<Timeline>(initial);
	const [history, setHistory] = createStore<History>({ past: [], future: [] });

	const moveClip = (trackId: string, clipId: string, newStart: number): void => {
		setTimeline(
			produce((draft) => {
				const clip = findClipInDraft(draft, trackId, clipId);
				if (!clip) return;
				const duration = clip.end - clip.start;
				const start = round(newStart);
				clip.start = start;
				clip.end = round(start + duration);
			}),
		);
	};

	const resizeClipLeft = (trackId: string, clipId: string, newStart: number): void => {
		setTimeline(
			produce((draft) => {
				const clip = findClipInDraft(draft, trackId, clipId);
				if (!clip) return;
				const next = round(newStart);
				if (next === clip.start) return;
				const delta = next - clip.start;
				clip.start = next;
				for (const kf of clip.keyframes) {
					kf.time = round(kf.time - delta);
				}
			}),
		);
	};

	const resizeClipRight = (trackId: string, clipId: string, newEnd: number): void => {
		setTimeline(
			produce((draft) => {
				const clip = findClipInDraft(draft, trackId, clipId);
				if (!clip) return;
				clip.end = round(newEnd);
			}),
		);
	};

	const setKeyframeTime = (
		trackId: string,
		clipId: string,
		index: number,
		newTime: number,
	): void => {
		setTimeline(
			produce((draft) => {
				const clip = findClipInDraft(draft, trackId, clipId);
				if (!clip) return;
				const kf = clip.keyframes[index];
				if (!kf) return;
				kf.time = round(newTime);
			}),
		);
	};

	const sortClipKeyframes = (trackId: string, clipId: string): void => {
		setTimeline(
			produce((draft) => {
				const clip = findClipInDraft(draft, trackId, clipId);
				if (!clip) return;
				clip.keyframes.sort((a, b) => a.time - b.time);
			}),
		);
	};

	const trimPast = (past: Command[]): Command[] =>
		past.length >= HISTORY_CAP ? past.slice(past.length - HISTORY_CAP + 1) : past;

	const push = (cmd: Command): void => {
		setTimeline(produce(cmd.apply));
		setHistory(
			produce((h) => {
				h.past = [...trimPast(h.past), cmd];
				h.future = [];
			}),
		);
	};

	const undo = (): void => {
		const cmd = history.past[history.past.length - 1];
		if (!cmd) return;
		setTimeline(produce(cmd.invert));
		setHistory(
			produce((h) => {
				h.past = h.past.slice(0, -1);
				h.future = [...h.future, cmd];
			}),
		);
	};

	const redo = (): void => {
		const cmd = history.future[history.future.length - 1];
		if (!cmd) return;
		setTimeline(produce(cmd.apply));
		setHistory(
			produce((h) => {
				h.future = h.future.slice(0, -1);
				h.past = [...trimPast(h.past), cmd];
			}),
		);
	};

	const clearHistory = (): void => {
		setHistory({ past: [], future: [] });
	};

	const canUndo = createMemo(() => history.past.length > 0);
	const canRedo = createMemo(() => history.future.length > 0);

	return {
		timeline,
		setTimeline,
		history,
		moveClip,
		resizeClipLeft,
		resizeClipRight,
		setKeyframeTime,
		sortClipKeyframes,
		push,
		undo,
		redo,
		canUndo,
		canRedo,
		clearHistory,
	};
};
