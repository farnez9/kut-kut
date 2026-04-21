import {
	type AudioClip,
	type AudioTrack,
	type Clip,
	isAudioTrack,
	isNumberTrack,
	type Timeline,
} from "@kut-kut/engine";
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
	appendAudioTrack: (track: AudioTrack) => void;
	removeAudioTrackById: (id: string) => void;
	setAudioTrackGain: (id: string, gain: number) => void;
	setAudioTrackMuted: (id: string, muted: boolean) => void;
	moveAudioClip: (trackId: string, clipId: string, newStart: number) => void;
	resizeAudioClipLeft: (trackId: string, clipId: string, newStart: number) => void;
	resizeAudioClipRight: (trackId: string, clipId: string, newEnd: number) => void;
};

const round = (v: number): number => Math.round(v * 1000) / 1000;

const findClipInDraft = (
	draft: Timeline,
	trackId: string,
	clipId: string,
): Clip<number> | undefined => {
	const track = draft.tracks.find((t) => t.id === trackId);
	if (!track || !isNumberTrack(track)) return undefined;
	return track.clips.find((c) => c.id === clipId);
};

const findAudioClipInDraft = (
	draft: Timeline,
	trackId: string,
	clipId: string,
): AudioClip | undefined => {
	const track = draft.tracks.find((t) => t.id === trackId);
	if (!track || !isAudioTrack(track)) return undefined;
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

	const appendAudioTrack = (track: AudioTrack): void => {
		mutate((draft) => {
			if (draft.tracks.some((t) => t.id === track.id)) return;
			draft.tracks.push(track);
		});
	};

	const removeAudioTrackById = (id: string): void => {
		mutate((draft) => {
			const idx = draft.tracks.findIndex((t) => t.id === id && isAudioTrack(t));
			if (idx < 0) return;
			draft.tracks.splice(idx, 1);
		});
	};

	const setAudioTrackGain = (id: string, gain: number): void => {
		mutate((draft) => {
			const track = draft.tracks.find((t) => t.id === id);
			if (!track || !isAudioTrack(track)) return;
			track.gain = gain;
		});
	};

	const setAudioTrackMuted = (id: string, muted: boolean): void => {
		mutate((draft) => {
			const track = draft.tracks.find((t) => t.id === id);
			if (!track || !isAudioTrack(track)) return;
			track.muted = muted;
		});
	};

	const moveAudioClip = (trackId: string, clipId: string, newStart: number): void => {
		mutate((draft) => {
			const clip = findAudioClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			const duration = clip.end - clip.start;
			const start = round(newStart);
			clip.start = start;
			clip.end = round(start + duration);
		});
	};

	const resizeAudioClipLeft = (trackId: string, clipId: string, newStart: number): void => {
		mutate((draft) => {
			const clip = findAudioClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			const next = round(newStart);
			if (next === clip.start) return;
			const delta = next - clip.start;
			clip.start = next;
			clip.offset = round(clip.offset + delta);
		});
	};

	const resizeAudioClipRight = (trackId: string, clipId: string, newEnd: number): void => {
		mutate((draft) => {
			const clip = findAudioClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			clip.end = round(newEnd);
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
		appendAudioTrack,
		removeAudioTrackById,
		setAudioTrackGain,
		setAudioTrackMuted,
		moveAudioClip,
		resizeAudioClipLeft,
		resizeAudioClipRight,
	};
};
