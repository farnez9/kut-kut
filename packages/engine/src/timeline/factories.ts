import { EasingName } from "./easing.ts";
import {
	type AudioClip,
	type AudioTrack,
	type CaptionClip,
	type CaptionTrack,
	type Clip,
	type Keyframe,
	type NumberTrack,
	type Timeline,
	type Track,
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

export type CreateAudioClipOptions = {
	id?: string;
	src: string;
	start: number;
	end: number;
	offset?: number;
	gain?: number;
	muted?: boolean;
};

export const createAudioClip = (options: CreateAudioClipOptions): AudioClip => {
	if (options.end < options.start) {
		throw new Error(`AudioClip end (${options.end}) precedes start (${options.start})`);
	}
	return {
		id: options.id ?? crypto.randomUUID(),
		src: options.src,
		start: options.start,
		end: options.end,
		offset: options.offset ?? 0,
		gain: options.gain ?? 1,
		muted: options.muted ?? false,
	};
};

export type CreateAudioTrackOptions = {
	id?: string;
	clips?: AudioClip[];
	gain?: number;
	muted?: boolean;
};

export const createAudioTrack = (options: CreateAudioTrackOptions = {}): AudioTrack => ({
	id: options.id ?? crypto.randomUUID(),
	kind: TrackKind.Audio,
	clips: options.clips ?? [],
	gain: options.gain ?? 1,
	muted: options.muted ?? false,
});

export type CreateCaptionClipOptions = {
	id?: string;
	start: number;
	end: number;
	text?: string;
};

export const createCaptionClip = (options: CreateCaptionClipOptions): CaptionClip => {
	if (options.end < options.start) {
		throw new Error(`CaptionClip end (${options.end}) precedes start (${options.start})`);
	}
	return {
		id: options.id ?? crypto.randomUUID(),
		start: options.start,
		end: options.end,
		text: options.text ?? "",
	};
};

export type CreateCaptionTrackOptions = {
	id?: string;
	clips?: CaptionClip[];
};

export const createCaptionTrack = (options: CreateCaptionTrackOptions = {}): CaptionTrack => ({
	id: options.id ?? crypto.randomUUID(),
	kind: TrackKind.Caption,
	clips: options.clips ?? [],
});

export type CreateTimelineOptions = {
	tracks?: Track[];
};

export const createTimeline = (options: CreateTimelineOptions = {}): Timeline => ({
	tracks: options.tracks ?? [],
});
