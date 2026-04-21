import {
	type AudioClip,
	type AudioTrack,
	type CaptionClip,
	type CaptionTrack,
	type Clip,
	isAudioTrack,
	isCaptionTrack,
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
	appendCaptionTrack: (track: CaptionTrack) => void;
	removeCaptionTrackById: (id: string) => void;
	appendCaptionClip: (trackId: string, clip: CaptionClip) => void;
	removeCaptionClipById: (trackId: string, clipId: string) => void;
	moveCaptionClip: (trackId: string, clipId: string, newStart: number) => void;
	resizeCaptionClipLeft: (trackId: string, clipId: string, newStart: number) => void;
	resizeCaptionClipRight: (trackId: string, clipId: string, newEnd: number) => void;
	setCaptionText: (trackId: string, clipId: string, text: string) => void;
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

const findCaptionTrackInDraft = (draft: Timeline, trackId: string): CaptionTrack | undefined => {
	const track = draft.tracks.find((t) => t.id === trackId);
	return track && isCaptionTrack(track) ? track : undefined;
};

const findCaptionClipInDraft = (
	draft: Timeline,
	trackId: string,
	clipId: string,
): CaptionClip | undefined => {
	const track = findCaptionTrackInDraft(draft, trackId);
	return track?.clips.find((c) => c.id === clipId);
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

	const appendCaptionTrack = (track: CaptionTrack): void => {
		mutate((draft) => {
			if (draft.tracks.some((t) => t.id === track.id)) return;
			draft.tracks.push(track);
		});
	};

	const removeCaptionTrackById = (id: string): void => {
		mutate((draft) => {
			const idx = draft.tracks.findIndex((t) => t.id === id && isCaptionTrack(t));
			if (idx < 0) return;
			draft.tracks.splice(idx, 1);
		});
	};

	const appendCaptionClip = (trackId: string, clip: CaptionClip): void => {
		mutate((draft) => {
			const track = findCaptionTrackInDraft(draft, trackId);
			if (!track) return;
			if (track.clips.some((c) => c.id === clip.id)) return;
			track.clips.push(clip);
		});
	};

	const removeCaptionClipById = (trackId: string, clipId: string): void => {
		mutate((draft) => {
			const track = findCaptionTrackInDraft(draft, trackId);
			if (!track) return;
			const idx = track.clips.findIndex((c) => c.id === clipId);
			if (idx < 0) return;
			track.clips.splice(idx, 1);
		});
	};

	const moveCaptionClip = (trackId: string, clipId: string, newStart: number): void => {
		mutate((draft) => {
			const clip = findCaptionClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			const duration = clip.end - clip.start;
			const start = round(newStart);
			clip.start = start;
			clip.end = round(start + duration);
		});
	};

	const resizeCaptionClipLeft = (trackId: string, clipId: string, newStart: number): void => {
		mutate((draft) => {
			const clip = findCaptionClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			clip.start = round(newStart);
		});
	};

	const resizeCaptionClipRight = (trackId: string, clipId: string, newEnd: number): void => {
		mutate((draft) => {
			const clip = findCaptionClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			clip.end = round(newEnd);
		});
	};

	const setCaptionText = (trackId: string, clipId: string, text: string): void => {
		mutate((draft) => {
			const clip = findCaptionClipInDraft(draft, trackId, clipId);
			if (!clip) return;
			clip.text = text;
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
		appendCaptionTrack,
		removeCaptionTrackById,
		appendCaptionClip,
		removeCaptionClipById,
		moveCaptionClip,
		resizeCaptionClipLeft,
		resizeCaptionClipRight,
		setCaptionText,
	};
};
