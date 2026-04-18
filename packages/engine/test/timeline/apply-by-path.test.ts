import { describe, expect, test } from "bun:test";
import {
	createGroup,
	createLayer2D,
	createRect,
	createScene,
	createTransform2D,
	findNodeByPath,
} from "../../src/scene/index.ts";
import { EasingName } from "../../src/timeline/easing.ts";
import {
	applyTimeline,
	createClip,
	createKeyframe,
	createTimeline,
	createTrack,
} from "../../src/timeline/index.ts";

describe("applyTimeline with nodePath targets", () => {
	const build = () => {
		const rect = createRect({
			name: "Hero",
			transform: { x: 0 },
		});
		const group = createGroup({
			name: "Stage",
			transform: createTransform2D({ x: 0 }),
			children: [rect],
		});
		const layer = createLayer2D({ name: "2D", children: [group] });
		const scene = createScene({ layers: [layer] });

		const timeline = createTimeline({
			tracks: [
				createTrack({
					target: { nodePath: ["2D", "Stage", "Hero"], property: "transform.x" },
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
				}),
			],
		});
		return { scene, timeline, rect };
	};

	test("resolves nested path and drives the property", () => {
		const { scene, timeline, rect } = build();
		applyTimeline(scene, timeline, 1);
		expect(rect.transform.x.get()).toBeCloseTo(50, 10);
	});

	test("findNodeByPath walks the name tree", () => {
		const { scene, rect } = build();
		expect(findNodeByPath(scene, ["2D", "Stage", "Hero"])).toBe(rect);
		expect(findNodeByPath(scene, ["2D", "Missing"])).toBeUndefined();
		expect(findNodeByPath(scene, [])).toBeUndefined();
	});

	test("silently skips tracks whose path does not resolve", () => {
		const { scene } = build();
		const bogus = createTimeline({
			tracks: [
				createTrack({
					target: { nodePath: ["2D", "Stage", "Missing"], property: "transform.x" },
					clips: [
						createClip({
							start: 0,
							end: 1,
							keyframes: [createKeyframe({ time: 0, value: 42 })],
						}),
					],
				}),
			],
		});
		expect(() => applyTimeline(scene, bogus, 0)).not.toThrow();
	});
});
