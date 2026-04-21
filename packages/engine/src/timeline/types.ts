import type { EasingName } from "./easing.ts";

export const TrackKind = {
	Number: "number",
	Audio: "audio",
	Caption: "caption",
} as const;

export type TrackKind = (typeof TrackKind)[keyof typeof TrackKind];

export type TrackTargetById = {
	nodeId: string;
	property: string;
};

export type TrackTargetByPath = {
	nodePath: string[];
	property: string;
};

export type TrackTarget = TrackTargetById | TrackTargetByPath;

export const isTrackTargetByPath = (target: TrackTarget): target is TrackTargetByPath =>
	"nodePath" in target;

export type Keyframe<T> = {
	time: number;
	value: T;
	easing: EasingName;
};

export type Clip<T> = {
	id: string;
	start: number;
	end: number;
	keyframes: Keyframe<T>[];
};

export type NumberTrack = {
	id: string;
	kind: typeof TrackKind.Number;
	target: TrackTarget;
	clips: Clip<number>[];
};

export type AudioClip = {
	id: string;
	src: string;
	start: number;
	end: number;
	offset: number;
	gain: number;
	muted: boolean;
};

export type AudioTrack = {
	id: string;
	kind: typeof TrackKind.Audio;
	clips: AudioClip[];
	gain: number;
	muted: boolean;
};

export type CaptionClip = {
	id: string;
	start: number;
	end: number;
	text: string;
};

export type CaptionTrack = {
	id: string;
	kind: typeof TrackKind.Caption;
	clips: CaptionClip[];
};

export type Track = NumberTrack | AudioTrack | CaptionTrack;

export const isNumberTrack = (track: Track): track is NumberTrack =>
	track.kind === TrackKind.Number;

export const isAudioTrack = (track: Track): track is AudioTrack => track.kind === TrackKind.Audio;

export const isCaptionTrack = (track: Track): track is CaptionTrack =>
	track.kind === TrackKind.Caption;

export type Timeline = {
	tracks: Track[];
};
