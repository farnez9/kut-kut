import { easings } from "./easing.ts";
import type { Clip, Track } from "./types.ts";

export const evaluateClip = (clip: Clip<number>, timeInClip: number): number | undefined => {
	const { keyframes } = clip;
	if (keyframes.length === 0) return undefined;
	const first = keyframes[0];
	const last = keyframes[keyframes.length - 1];
	if (!first || !last) return undefined;
	if (timeInClip <= first.time) return first.value;
	if (timeInClip >= last.time) return last.value;
	for (let i = 0; i < keyframes.length - 1; i++) {
		const k0 = keyframes[i];
		const k1 = keyframes[i + 1];
		if (!k0 || !k1) continue;
		if (timeInClip >= k0.time && timeInClip <= k1.time) {
			const span = k1.time - k0.time;
			if (span === 0) return k1.value;
			const t = (timeInClip - k0.time) / span;
			const eased = easings[k0.easing](t);
			return k0.value + (k1.value - k0.value) * eased;
		}
	}
	return undefined;
};

export const evaluateTrack = (track: Track, sceneTime: number): number | undefined => {
	for (const clip of track.clips) {
		if (sceneTime < clip.start || sceneTime > clip.end) continue;
		const value = evaluateClip(clip, sceneTime - clip.start);
		if (value !== undefined) return value;
	}
	return undefined;
};
