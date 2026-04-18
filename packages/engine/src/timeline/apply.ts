import type { Property } from "../reactive/property.ts";
import { findNodeById } from "../scene/find.ts";
import type { Node } from "../scene/node.ts";
import type { Scene } from "../scene/scene.ts";
import { evaluateTrack } from "./evaluate.ts";
import type { Timeline, Track } from "./types.ts";

const isNumberProperty = (value: unknown): value is Property<number> => {
	if (value === null || typeof value !== "object") return false;
	const maybe = value as { get?: unknown; set?: unknown };
	return typeof maybe.get === "function" && typeof maybe.set === "function";
};

const resolveProperty = (node: Node, path: string): Property<number> | undefined => {
	const segments = path.split(".");
	let current: unknown = node;
	for (const segment of segments) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[segment];
		if (current === undefined) return undefined;
	}
	return isNumberProperty(current) ? current : undefined;
};

const applyTrack = (scene: Scene, track: Track, time: number): void => {
	const value = evaluateTrack(track, time);
	if (value === undefined) return;
	const node = findNodeById(scene, track.target.nodeId);
	if (!node) return;
	const property = resolveProperty(node, track.target.property);
	if (!property) return;
	property.set(value);
};

export const applyTimeline = (scene: Scene, timeline: Timeline, time: number): void => {
	for (const track of timeline.tracks) {
		applyTrack(scene, track, time);
	}
};
