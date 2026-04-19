import type { Clip, Timeline, Track } from "@kut-kut/engine";
import { createStore, produce, type Store } from "solid-js/store";

export type Mutator = (fn: (draft: Timeline) => void) => void;

export type TimelineStore = {
	timeline: Store<Timeline>;
	setTimeline: ReturnType<typeof createStore<Timeline>>[1];
	mutate: Mutator;
	moveClip: (trackId: string, clipId: string, newStart: number) => void;
	resizeClipLeft: (trackId: string, clipId: string, newStart: number) => void;
	resizeClipRight: (trackId: string, clipId: string, newEnd: number) => void;
	setKeyframeTime: (trackId: string, clipId: string, index: number, newTime: number) => void;
	sortClipKeyframes: (trackId: string, clipId: string) => void;
};

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

	const mutate: Mutator = (fn) => setTimeline(produce(fn));

	const moveClip = (trackId: string, clipId: string, newStart: number): void => {
		mutate((draft) => {
			const clip = findClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			const duration = clip.end - clip.start;
			const start = round(newStart);
			clip.start = start;
			clip.end = round(start + duration);
		});
	};

	const resizeClipLeft = (trackId: string, clipId: string, newStart: number): void => {
		mutate((draft) => {
			const clip = findClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			const next = round(newStart);
			if (next === clip.start) return;
			const delta = next - clip.start;
			clip.start = next;
			for (const kf of clip.keyframes) {
				kf.time = round(kf.time - delta);
			}
		});
	};

	const resizeClipRight = (trackId: string, clipId: string, newEnd: number): void => {
		mutate((draft) => {
			const clip = findClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			clip.end = round(newEnd);
		});
	};

	const setKeyframeTime = (
		trackId: string,
		clipId: string,
		index: number,
		newTime: number,
	): void => {
		mutate((draft) => {
			const clip = findClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			const kf = clip.keyframes[index];
			if (!kf) return;
			kf.time = round(newTime);
		});
	};

	const sortClipKeyframes = (trackId: string, clipId: string): void => {
		mutate((draft) => {
			const clip = findClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			clip.keyframes.sort((a, b) => a.time - b.time);
		});
	};

	return {
		timeline,
		setTimeline,
		mutate,
		moveClip,
		resizeClipLeft,
		resizeClipRight,
		setKeyframeTime,
		sortClipKeyframes,
	};
};
