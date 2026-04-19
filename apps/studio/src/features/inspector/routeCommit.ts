import {
	EasingName,
	isNumberTrack,
	isTrackTargetByPath,
	type Keyframe,
	type OverrideValue,
	type Timeline,
} from "@kut-kut/engine";
import type { CommandStore } from "../../lib/commands/index.ts";
import { sameNodePath } from "../overlay/context.ts";
import type { OverlayContextValue } from "../overlay/index.ts";
import type { PlaybackContextValue } from "../playback/index.ts";
import type { RecordContextValue } from "../record/index.ts";
import { upsertKeyframeCommand } from "../timeline/commands.ts";
import type { TimelineContextValue } from "../timeline/index.ts";

const round = (v: number): number => Math.round(v * 1000) / 1000;

export type NumberTrackCoverage = {
	trackId: string;
	clipId: string;
	localTime: number;
	prevKeyframe: Keyframe<number> | null;
	easing: EasingName;
};

export const findNumberTrackCoverage = (
	timeline: Timeline,
	nodePath: string[],
	property: string,
	t: number,
): NumberTrackCoverage | null => {
	for (const track of timeline.tracks) {
		if (!isNumberTrack(track)) continue;
		const target = track.target;
		if (!isTrackTargetByPath(target)) continue;
		if (target.property !== property) continue;
		if (!sameNodePath(target.nodePath, nodePath)) continue;
		for (const clip of track.clips) {
			if (t < clip.start || t > clip.end) continue;
			const localTime = round(t - clip.start);
			const existing = clip.keyframes.find((k) => round(k.time) === localTime) ?? null;
			const easing = existing?.easing ?? EasingName.Linear;
			return {
				trackId: track.id,
				clipId: clip.id,
				localTime,
				prevKeyframe: existing,
				easing,
			};
		}
	}
	return null;
};

export type RouteDeps = {
	overlay: OverlayContextValue;
	timeline: TimelineContextValue;
	record: RecordContextValue;
	commands: CommandStore;
	playback: PlaybackContextValue;
};

export const commitPropertyEdit = (
	deps: RouteDeps,
	nodePath: string[],
	property: string,
	nextValue: OverrideValue,
): void => {
	if (deps.record.active() && typeof nextValue === "number") {
		const hit = findNumberTrackCoverage(
			deps.timeline.timeline,
			nodePath,
			property,
			deps.playback.time(),
		);
		if (hit) {
			deps.commands.push(
				upsertKeyframeCommand(
					deps.timeline.mutate,
					hit.trackId,
					hit.clipId,
					hit.localTime,
					hit.prevKeyframe,
					hit.easing,
					nextValue,
				),
			);
			return;
		}
	}
	deps.overlay.setOverride(nodePath, property, nextValue);
};
