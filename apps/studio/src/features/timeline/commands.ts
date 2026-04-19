import { isNumberTrack, type Keyframe, type Timeline } from "@kut-kut/engine";
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
