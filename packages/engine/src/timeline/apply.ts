import { isNumberProperty, resolveProperty } from "../reactive/resolve-property.ts";
import { findNodeById, findNodeByPath } from "../scene/find.ts";
import type { Node } from "../scene/node.ts";
import type { Scene } from "../scene/scene.ts";
import { evaluateTrack } from "./evaluate.ts";
import { isNumberTrack, isTrackTargetByPath, type NumberTrack, type Timeline } from "./types.ts";

const resolveTargetNode = (scene: Scene, track: NumberTrack): Node | undefined =>
	isTrackTargetByPath(track.target)
		? findNodeByPath(scene, track.target.nodePath)
		: findNodeById(scene, track.target.nodeId);

const applyNumberTrack = (scene: Scene, track: NumberTrack, time: number): void => {
	const value = evaluateTrack(track, time);
	if (value === undefined) return;
	const node = resolveTargetNode(scene, track);
	if (!node) return;
	const property = resolveProperty(node, track.target.property);
	if (!property || !isNumberProperty(property)) return;
	property.set(value);
};

export const applyTimeline = (scene: Scene, timeline: Timeline, time: number): void => {
	for (const track of timeline.tracks) {
		if (isNumberTrack(track)) applyNumberTrack(scene, track, time);
	}
};
