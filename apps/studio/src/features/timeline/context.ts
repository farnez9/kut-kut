import type { AudioTrack, Timeline } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";
import type { SetStoreFunction, Store } from "solid-js/store";
import type { Command } from "../../lib/commands/index.ts";
import type { Mutator } from "./store.ts";

export type TimelineSelection = {
	clipId: string | null;
	keyframeId: string | null;
	nodePath: string[] | null;
};

export type TimelineView = {
	zoom: number;
	origin: number;
	selection: TimelineSelection;
};

export type TimelineSaveState = "idle" | "pending" | "saving" | "error";

export const makeKeyframeId = (clipId: string, index: number): string => `${clipId}:${index}`;

export const parseKeyframeId = (id: string): { clipId: string; index: number } | null => {
	const sep = id.lastIndexOf(":");
	if (sep < 0) return null;
	const clipId = id.slice(0, sep);
	const index = Number(id.slice(sep + 1));
	if (!clipId || !Number.isInteger(index) || index < 0) return null;
	return { clipId, index };
};

export type TimelineContextValue = {
	name: Accessor<string>;
	duration: Accessor<number>;
	timeline: Store<Timeline>;
	view: Store<TimelineView>;
	setView: SetStoreFunction<TimelineView>;
	mutate: Mutator;
	moveClip: (trackId: string, clipId: string, newStart: number) => void;
	resizeClipLeft: (trackId: string, clipId: string, newStart: number) => void;
	resizeClipRight: (trackId: string, clipId: string, newEnd: number) => void;
	setKeyframeTime: (trackId: string, clipId: string, index: number, newTime: number) => void;
	sortClipKeyframes: (trackId: string, clipId: string) => void;
	addAudioTrack: (track: AudioTrack) => void;
	removeAudioTrack: (trackId: string) => void;
	setAudioTrackGain: (trackId: string, next: number) => void;
	setAudioTrackMuted: (trackId: string, next: boolean) => void;
	push: (cmd: Command) => void;
	undo: () => void;
	redo: () => void;
	canUndo: Accessor<boolean>;
	canRedo: Accessor<boolean>;
	selectClip: (clipId: string | null) => void;
	selectKeyframe: (clipId: string, index: number) => void;
	selectNode: (nodePath: string[] | null) => void;
	clearSelection: () => void;
	saveState: Accessor<TimelineSaveState>;
	saveError: Accessor<Error | null>;
};

export const TimelineContext = createContext<TimelineContextValue>();

export const useTimeline = (): TimelineContextValue => {
	const ctx = useContext(TimelineContext);
	if (!ctx) throw new Error("useTimeline must be used inside <TimelineProvider>");
	return ctx;
};
