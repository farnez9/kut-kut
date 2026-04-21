import {
	type AudioTrack,
	type CaptionClip,
	type CaptionTrack,
	isAudioTrack,
	isCaptionTrack,
	isNumberTrack,
	type Keyframe,
	type Timeline,
} from "@kut-kut/engine";
import type { Command } from "../../lib/commands/index.ts";
import type { Mutator } from "./store.ts";

const round = (v: number): number => Math.round(v * 1000) / 1000;

const findClip = (draft: Timeline, trackId: string, clipId: string) => {
	const track = draft.tracks.find((t) => t.id === trackId);
	if (!track || !isNumberTrack(track)) return null;
	const clip = track.clips.find((c) => c.id === clipId);
	if (!clip) return null;
	return clip;
};

const findAudioClip = (draft: Timeline, trackId: string, clipId: string) => {
	const track = draft.tracks.find((t) => t.id === trackId);
	if (!track || !isAudioTrack(track)) return null;
	const clip = track.clips.find((c) => c.id === clipId);
	if (!clip) return null;
	return clip;
};

const findCaptionTrack = (draft: Timeline, trackId: string): CaptionTrack | null => {
	const track = draft.tracks.find((t) => t.id === trackId);
	return track && isCaptionTrack(track) ? track : null;
};

const findCaptionClip = (draft: Timeline, trackId: string, clipId: string): CaptionClip | null => {
	const track = findCaptionTrack(draft, trackId);
	if (!track) return null;
	return track.clips.find((c) => c.id === clipId) ?? null;
};

const cloneCaptionTrack = (track: CaptionTrack): CaptionTrack => ({
	...track,
	clips: track.clips.map((c) => ({ ...c })),
});

export const moveClipCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const set = (start: number): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			const duration = clip.end - clip.start;
			clip.start = round(start);
			clip.end = round(start + duration);
		});
	};
	return {
		label: "Move clip",
		apply: () => set(nextStart),
		invert: () => set(prevStart),
	};
};

export const resizeClipLeftCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const shiftTo = (target: number): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			const next = round(target);
			if (next === clip.start) return;
			const delta = next - clip.start;
			clip.start = next;
			for (const kf of clip.keyframes) {
				kf.time = round(kf.time - delta);
			}
		});
	};
	return {
		label: "Trim clip left",
		apply: () => shiftTo(nextStart),
		invert: () => shiftTo(prevStart),
	};
};

export const resizeClipRightCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevEnd: number,
	nextEnd: number,
): Command => {
	const set = (end: number): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			clip.end = round(end);
		});
	};
	return {
		label: "Trim clip right",
		apply: () => set(nextEnd),
		invert: () => set(prevEnd),
	};
};

export const moveKeyframeCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevIndex: number,
	prevTime: number,
	nextTime: number,
): Command => {
	let postIndex = -1;

	const apply = (): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			const kf = clip.keyframes[prevIndex];
			if (!kf) return;
			kf.time = round(nextTime);
			clip.keyframes.sort((a, b) => a.time - b.time);
			postIndex = clip.keyframes.indexOf(kf);
		});
	};

	const invert = (): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			const idx = postIndex >= 0 ? postIndex : prevIndex;
			const kf = clip.keyframes[idx];
			if (!kf) return;
			kf.time = round(prevTime);
			clip.keyframes.sort((a, b) => a.time - b.time);
		});
	};

	return { label: "Move keyframe", apply, invert };
};

export const addAudioTrackCommand = (mutate: Mutator, track: AudioTrack): Command => {
	const snapshot: AudioTrack = { ...track, clips: track.clips.map((c) => ({ ...c })) };
	const apply = (): void => {
		mutate((draft) => {
			if (draft.tracks.some((t) => t.id === snapshot.id)) return;
			draft.tracks.push({ ...snapshot, clips: snapshot.clips.map((c) => ({ ...c })) });
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			const idx = draft.tracks.findIndex((t) => t.id === snapshot.id);
			if (idx < 0) return;
			draft.tracks.splice(idx, 1);
		});
	};
	return { label: "Add audio track", apply, invert };
};

export const removeAudioTrackCommand = (
	mutate: Mutator,
	trackId: string,
	captured: AudioTrack,
): Command => {
	const snapshot: AudioTrack = { ...captured, clips: captured.clips.map((c) => ({ ...c })) };
	const apply = (): void => {
		mutate((draft) => {
			const idx = draft.tracks.findIndex((t) => t.id === trackId);
			if (idx < 0) return;
			draft.tracks.splice(idx, 1);
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			if (draft.tracks.some((t) => t.id === trackId)) return;
			draft.tracks.push({ ...snapshot, clips: snapshot.clips.map((c) => ({ ...c })) });
		});
	};
	return { label: "Remove audio track", apply, invert };
};

export const setAudioTrackGainCommand = (
	mutate: Mutator,
	trackId: string,
	prev: number,
	next: number,
): Command => {
	const set = (value: number): void => {
		mutate((draft) => {
			const track = draft.tracks.find((t) => t.id === trackId);
			if (!track || !isAudioTrack(track)) return;
			track.gain = value;
		});
	};
	return {
		label: "Set audio gain",
		apply: () => set(next),
		invert: () => set(prev),
	};
};

export const setAudioTrackMutedCommand = (
	mutate: Mutator,
	trackId: string,
	prev: boolean,
	next: boolean,
): Command => {
	const set = (value: boolean): void => {
		mutate((draft) => {
			const track = draft.tracks.find((t) => t.id === trackId);
			if (!track || !isAudioTrack(track)) return;
			track.muted = value;
		});
	};
	return {
		label: next ? "Mute audio track" : "Unmute audio track",
		apply: () => set(next),
		invert: () => set(prev),
	};
};

export const moveAudioClipCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const set = (start: number): void => {
		mutate((draft) => {
			const clip = findAudioClip(draft, trackId, clipId);
			if (!clip) return;
			const duration = clip.end - clip.start;
			clip.start = round(start);
			clip.end = round(start + duration);
		});
	};
	return {
		label: "Move audio clip",
		apply: () => set(nextStart),
		invert: () => set(prevStart),
	};
};

export const resizeAudioClipLeftCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const shiftTo = (target: number): void => {
		mutate((draft) => {
			const clip = findAudioClip(draft, trackId, clipId);
			if (!clip) return;
			const next = round(target);
			if (next === clip.start) return;
			const delta = next - clip.start;
			clip.start = next;
			clip.offset = round(clip.offset + delta);
		});
	};
	return {
		label: "Trim audio clip left",
		apply: () => shiftTo(nextStart),
		invert: () => shiftTo(prevStart),
	};
};

export const resizeAudioClipRightCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevEnd: number,
	nextEnd: number,
): Command => {
	const set = (end: number): void => {
		mutate((draft) => {
			const clip = findAudioClip(draft, trackId, clipId);
			if (!clip) return;
			clip.end = round(end);
		});
	};
	return {
		label: "Trim audio clip right",
		apply: () => set(nextEnd),
		invert: () => set(prevEnd),
	};
};

export const addCaptionTrackCommand = (mutate: Mutator, track: CaptionTrack): Command => {
	const snapshot = cloneCaptionTrack(track);
	const apply = (): void => {
		mutate((draft) => {
			if (draft.tracks.some((t) => t.id === snapshot.id)) return;
			draft.tracks.push(cloneCaptionTrack(snapshot));
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			const idx = draft.tracks.findIndex((t) => t.id === snapshot.id);
			if (idx < 0) return;
			draft.tracks.splice(idx, 1);
		});
	};
	return { label: "Add caption track", apply, invert };
};

export const removeCaptionTrackCommand = (
	mutate: Mutator,
	trackId: string,
	captured: CaptionTrack,
): Command => {
	const snapshot = cloneCaptionTrack(captured);
	const apply = (): void => {
		mutate((draft) => {
			const idx = draft.tracks.findIndex((t) => t.id === trackId);
			if (idx < 0) return;
			draft.tracks.splice(idx, 1);
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			if (draft.tracks.some((t) => t.id === trackId)) return;
			draft.tracks.push(cloneCaptionTrack(snapshot));
		});
	};
	return { label: "Remove caption track", apply, invert };
};

export const addCaptionClipCommand = (
	mutate: Mutator,
	trackId: string,
	clip: CaptionClip,
): Command => {
	const snapshot: CaptionClip = { ...clip };
	const apply = (): void => {
		mutate((draft) => {
			const track = findCaptionTrack(draft, trackId);
			if (!track) return;
			if (track.clips.some((c) => c.id === snapshot.id)) return;
			track.clips.push({ ...snapshot });
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			const track = findCaptionTrack(draft, trackId);
			if (!track) return;
			const idx = track.clips.findIndex((c) => c.id === snapshot.id);
			if (idx < 0) return;
			track.clips.splice(idx, 1);
		});
	};
	return { label: "Add caption", apply, invert };
};

export const removeCaptionClipCommand = (
	mutate: Mutator,
	trackId: string,
	captured: CaptionClip,
): Command => {
	const snapshot: CaptionClip = { ...captured };
	const apply = (): void => {
		mutate((draft) => {
			const track = findCaptionTrack(draft, trackId);
			if (!track) return;
			const idx = track.clips.findIndex((c) => c.id === snapshot.id);
			if (idx < 0) return;
			track.clips.splice(idx, 1);
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			const track = findCaptionTrack(draft, trackId);
			if (!track) return;
			if (track.clips.some((c) => c.id === snapshot.id)) return;
			track.clips.push({ ...snapshot });
		});
	};
	return { label: "Delete caption", apply, invert };
};

export const moveCaptionClipCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const set = (start: number): void => {
		mutate((draft) => {
			const clip = findCaptionClip(draft, trackId, clipId);
			if (!clip) return;
			const duration = clip.end - clip.start;
			clip.start = round(start);
			clip.end = round(start + duration);
		});
	};
	return {
		label: "Move caption",
		apply: () => set(nextStart),
		invert: () => set(prevStart),
	};
};

export const resizeCaptionClipLeftCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const set = (start: number): void => {
		mutate((draft) => {
			const clip = findCaptionClip(draft, trackId, clipId);
			if (!clip) return;
			clip.start = round(start);
		});
	};
	return {
		label: "Trim caption left",
		apply: () => set(nextStart),
		invert: () => set(prevStart),
	};
};

export const resizeCaptionClipRightCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevEnd: number,
	nextEnd: number,
): Command => {
	const set = (end: number): void => {
		mutate((draft) => {
			const clip = findCaptionClip(draft, trackId, clipId);
			if (!clip) return;
			clip.end = round(end);
		});
	};
	return {
		label: "Trim caption right",
		apply: () => set(nextEnd),
		invert: () => set(prevEnd),
	};
};

export const setCaptionTextCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	prevText: string,
	nextText: string,
): Command => {
	const set = (text: string): void => {
		mutate((draft) => {
			const clip = findCaptionClip(draft, trackId, clipId);
			if (!clip) return;
			clip.text = text;
		});
	};
	return {
		label: "Edit caption text",
		apply: () => set(nextText),
		invert: () => set(prevText),
	};
};

export const upsertKeyframeCommand = (
	mutate: Mutator,
	trackId: string,
	clipId: string,
	localTime: number,
	prevKeyframe: Keyframe<number> | null,
	easing: Keyframe<number>["easing"],
	nextValue: number,
): Command => {
	const t = round(localTime);

	const apply = (): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			const existing = clip.keyframes.find((k) => round(k.time) === t);
			if (existing) {
				existing.value = nextValue;
				return;
			}
			clip.keyframes.push({ time: t, value: nextValue, easing });
			clip.keyframes.sort((a, b) => a.time - b.time);
		});
	};

	const invert = (): void => {
		mutate((draft) => {
			const clip = findClip(draft, trackId, clipId);
			if (!clip) return;
			const idx = clip.keyframes.findIndex((k) => round(k.time) === t);
			if (idx < 0) return;
			if (prevKeyframe) {
				clip.keyframes[idx] = { ...prevKeyframe };
				clip.keyframes.sort((a, b) => a.time - b.time);
				return;
			}
			clip.keyframes.splice(idx, 1);
		});
	};

	return { label: prevKeyframe ? "Update keyframe" : "Add keyframe", apply, invert };
};
