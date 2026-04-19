import type { Timeline } from "@kut-kut/engine";

export type Command = {
	label: string;
	apply: (draft: Timeline) => void;
	invert: (draft: Timeline) => void;
};

const round = (v: number): number => Math.round(v * 1000) / 1000;

const findClip = (draft: Timeline, trackId: string, clipId: string) => {
	const track = draft.tracks.find((t) => t.id === trackId);
	if (!track) return null;
	const clip = track.clips.find((c) => c.id === clipId);
	if (!clip) return null;
	return clip;
};

export const moveClipCommand = (
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const set = (draft: Timeline, start: number): void => {
		const clip = findClip(draft, trackId, clipId);
		if (!clip) return;
		const duration = clip.end - clip.start;
		clip.start = round(start);
		clip.end = round(start + duration);
	};
	return {
		label: "Move clip",
		apply: (draft) => set(draft, nextStart),
		invert: (draft) => set(draft, prevStart),
	};
};

export const resizeClipLeftCommand = (
	trackId: string,
	clipId: string,
	prevStart: number,
	nextStart: number,
): Command => {
	const shiftTo = (draft: Timeline, target: number): void => {
		const clip = findClip(draft, trackId, clipId);
		if (!clip) return;
		const next = round(target);
		if (next === clip.start) return;
		const delta = next - clip.start;
		clip.start = next;
		for (const kf of clip.keyframes) {
			kf.time = round(kf.time - delta);
		}
	};
	return {
		label: "Trim clip left",
		apply: (draft) => shiftTo(draft, nextStart),
		invert: (draft) => shiftTo(draft, prevStart),
	};
};

export const resizeClipRightCommand = (
	trackId: string,
	clipId: string,
	prevEnd: number,
	nextEnd: number,
): Command => {
	const set = (draft: Timeline, end: number): void => {
		const clip = findClip(draft, trackId, clipId);
		if (!clip) return;
		clip.end = round(end);
	};
	return {
		label: "Trim clip right",
		apply: (draft) => set(draft, nextEnd),
		invert: (draft) => set(draft, prevEnd),
	};
};

export const moveKeyframeCommand = (
	trackId: string,
	clipId: string,
	prevIndex: number,
	prevTime: number,
	nextTime: number,
): Command => {
	let postIndex = -1;

	const apply = (draft: Timeline): void => {
		const clip = findClip(draft, trackId, clipId);
		if (!clip) return;
		const kf = clip.keyframes[prevIndex];
		if (!kf) return;
		kf.time = round(nextTime);
		clip.keyframes.sort((a, b) => a.time - b.time);
		postIndex = clip.keyframes.indexOf(kf);
	};

	const invert = (draft: Timeline): void => {
		const clip = findClip(draft, trackId, clipId);
		if (!clip) return;
		const idx = postIndex >= 0 ? postIndex : prevIndex;
		const kf = clip.keyframes[idx];
		if (!kf) return;
		kf.time = round(prevTime);
		clip.keyframes.sort((a, b) => a.time - b.time);
	};

	return { label: "Move keyframe", apply, invert };
};
