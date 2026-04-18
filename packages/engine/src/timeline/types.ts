import type { EasingName } from "./easing.ts";

export const TrackKind = {
	Number: "number",
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

export type Track = NumberTrack;

export type Timeline = {
	tracks: Track[];
};
