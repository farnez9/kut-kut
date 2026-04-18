import { EasingName } from "./easing.ts";
import {
	type Clip,
	type Keyframe,
	type NumberTrack,
	type Timeline,
	TrackKind,
	type TrackTarget,
} from "./types.ts";

export type CreateKeyframeOptions = {
	time: number;
	value: number;
	easing?: EasingName;
};

export const createKeyframe = (options: CreateKeyframeOptions): Keyframe<number> => ({
	time: options.time,
	value: options.value,
	easing: options.easing ?? EasingName.Linear,
});

export type CreateClipOptions = {
	id?: string;
	start: number;
	end: number;
	keyframes?: Keyframe<number>[];
};

export const createClip = (options: CreateClipOptions): Clip<number> => {
	if (options.end < options.start) {
		throw new Error(`Clip end (${options.end}) precedes start (${options.start})`);
	}
	const keyframes = (options.keyframes ?? []).slice().sort((a, b) => a.time - b.time);
	return {
		id: options.id ?? crypto.randomUUID(),
		start: options.start,
		end: options.end,
		keyframes,
	};
};

export type CreateTrackOptions = {
	id?: string;
	target: TrackTarget;
	clips?: Clip<number>[];
};

export const createTrack = (options: CreateTrackOptions): NumberTrack => ({
	id: options.id ?? crypto.randomUUID(),
	kind: TrackKind.Number,
	target: { ...options.target },
	clips: options.clips ?? [],
});

export type CreateTimelineOptions = {
	tracks?: NumberTrack[];
};

export const createTimeline = (options: CreateTimelineOptions = {}): Timeline => ({
	tracks: options.tracks ?? [],
});
