import { describe, expect, test } from "bun:test";
import {
	createGroup,
	createLayer2D,
	createScene,
	createTransform2D,
	findNodeById,
} from "../../src/scene/index.ts";
import { EasingName } from "../../src/timeline/easing.ts";
import {
	applyTimeline,
	createClip,
	createKeyframe,
	createTimeline,
	createTrack,
} from "../../src/timeline/index.ts";

const buildSceneWithTimeline = () => {
	const inner = createGroup({
		id: "g-inner",
		transform: createTransform2D({ x: 0, opacity: 1 }),
	});
	const layer = createLayer2D({ id: "l-main", children: [inner] });
	const scene = createScene({ layers: [layer] });

	const xTrack = createTrack({
		target: { nodeId: "g-inner", property: "transform.x" },
		clips: [
			createClip({
				start: 0,
				end: 2,
				keyframes: [
					createKeyframe({ time: 0, value: 0, easing: EasingName.Linear }),
					createKeyframe({ time: 2, value: 100, easing: EasingName.Linear }),
				],
			}),
		],
	});
	const opacityTrack = createTrack({
		target: { nodeId: "l-main", property: "transform.opacity" },
		clips: [
			createClip({
				start: 1,
				end: 2,
				keyframes: [
					createKeyframe({ time: 0, value: 1, easing: EasingName.Linear }),
					createKeyframe({ time: 1, value: 0, easing: EasingName.Linear }),
				],
			}),
		],
	});
	const timeline = createTimeline({ tracks: [xTrack, opacityTrack] });
	return { scene, timeline };
};

describe("applyTimeline", () => {
	test("drives a property via dotted path at t=0", () => {
		const { scene, timeline } = buildSceneWithTimeline();
		applyTimeline(scene, timeline, 0);
		const inner = findNodeById(scene, "g-inner");
		if (!inner || inner.transform.kind !== "2d") throw new Error("unreachable");
		expect(inner.transform.x.get()).toBeCloseTo(0, 10);
	});

	test("interpolates over scene time", () => {
		const { scene, timeline } = buildSceneWithTimeline();
		applyTimeline(scene, timeline, 1);
		const inner = findNodeById(scene, "g-inner");
		if (!inner || inner.transform.kind !== "2d") throw new Error("unreachable");
		expect(inner.transform.x.get()).toBeCloseTo(50, 10);
	});

	test("leaves properties untouched when no track covers the time", () => {
		const { scene, timeline } = buildSceneWithTimeline();
		const layer = findNodeById(scene, "l-main");
		if (!layer || layer.transform.kind !== "2d") throw new Error("unreachable");
		layer.transform.opacity.set(0.7);
		applyTimeline(scene, timeline, 0.5); // opacity track only starts at 1
		expect(layer.transform.opacity.get()).toBeCloseTo(0.7, 10);
	});

	test("applies multiple tracks in a single pass", () => {
		const { scene, timeline } = buildSceneWithTimeline();
		applyTimeline(scene, timeline, 1.5);
		const inner = findNodeById(scene, "g-inner");
		const layer = findNodeById(scene, "l-main");
		if (!inner || inner.transform.kind !== "2d") throw new Error("unreachable");
		if (!layer || layer.transform.kind !== "2d") throw new Error("unreachable");
		expect(inner.transform.x.get()).toBeCloseTo(75, 10);
		expect(layer.transform.opacity.get()).toBeCloseTo(0.5, 10);
	});

	test("silently skips tracks whose target does not resolve", () => {
		const scene = createScene({
			layers: [
				createLayer2D({
					id: "l",
					children: [createGroup({ id: "g", transform: createTransform2D({ x: 5 }) })],
				}),
			],
		});
		const timeline = createTimeline({
			tracks: [
				createTrack({
					target: { nodeId: "missing", property: "transform.x" },
					clips: [
						createClip({
							start: 0,
							end: 1,
							keyframes: [createKeyframe({ time: 0, value: 42 })],
						}),
					],
				}),
				createTrack({
					target: { nodeId: "g", property: "transform.nope" },
					clips: [
						createClip({
							start: 0,
							end: 1,
							keyframes: [createKeyframe({ time: 0, value: 99 })],
						}),
					],
				}),
			],
		});
		expect(() => applyTimeline(scene, timeline, 0)).not.toThrow();
		const group = findNodeById(scene, "g");
		if (!group || group.transform.kind !== "2d") throw new Error("unreachable");
		expect(group.transform.x.get()).toBe(5);
	});
});
