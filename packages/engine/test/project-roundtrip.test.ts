import { describe, expect, test } from "bun:test";
import {
	CURRENT_SCHEMA_VERSION,
	deserialize,
	serialize,
	UnknownSchemaVersionError,
} from "../src/project/index.ts";
import {
	createBox,
	createGroup,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	createTransform2D,
	createTransform3D,
} from "../src/scene/index.ts";
import {
	createClip,
	createKeyframe,
	createTimeline,
	createTrack,
	EasingName,
} from "../src/timeline/index.ts";

const buildFixtureScene = () => {
	const deepRect = createRect({
		id: "r-deep",
		name: "deep-rect",
		transform: { x: 1, y: 2, scaleX: 3, scaleY: 3 },
		color: [0.1, 0.2, 0.3],
	});
	const deepGroup = createGroup({
		id: "g-deep",
		name: "deep",
		transform: createTransform2D({ x: 5, y: -3, opacity: 0.25 }),
		children: [deepRect],
	});
	const outerGroup = createGroup({
		id: "g-outer",
		name: "outer",
		transform: createTransform2D({ scaleX: 2, scaleY: 2 }),
		children: [deepGroup],
	});
	const meshGroup = createGroup({
		id: "g-mesh",
		name: "mesh-group",
		transform: createTransform3D({ position: [1, 2, 3], scale: [0.5, 0.5, 0.5] }),
		children: [
			createBox({
				id: "b-1",
				name: "cube",
				transform: { position: [4, 5, 6], rotation: [0, 1, 0] },
				color: [0.9, 0.1, 0.5],
			}),
		],
	});
	return createScene({
		meta: { name: "roundtrip", width: 1280, height: 720, fps: 60, duration: 5 },
		layers: [
			createLayer2D({ id: "l-2d", name: "background", children: [outerGroup] }),
			createLayer3D({
				id: "l-3d",
				name: "foreground",
				transform: { position: [0, 0, -10] },
				children: [meshGroup],
			}),
		],
	});
};

const buildFixtureTimeline = () =>
	createTimeline({
		tracks: [
			createTrack({
				id: "t-x",
				target: { nodeId: "g-deep", property: "transform.x" },
				clips: [
					createClip({
						id: "c-x-1",
						start: 0,
						end: 2,
						keyframes: [
							createKeyframe({ time: 0, value: 0, easing: EasingName.EaseInOutCubic }),
							createKeyframe({ time: 2, value: 50, easing: EasingName.Linear }),
						],
					}),
					createClip({
						id: "c-x-2",
						start: 3,
						end: 5,
						keyframes: [
							createKeyframe({ time: 0, value: 50, easing: EasingName.StepHold }),
							createKeyframe({ time: 2, value: 100 }),
						],
					}),
				],
			}),
			createTrack({
				id: "t-op",
				target: { nodeId: "l-2d", property: "transform.opacity" },
				clips: [
					createClip({
						id: "c-op",
						start: 0,
						end: 1,
						keyframes: [
							createKeyframe({ time: 0, value: 0, easing: EasingName.EaseOutQuad }),
							createKeyframe({ time: 1, value: 1 }),
						],
					}),
				],
			}),
		],
	});

describe("project roundtrip", () => {
	test("serialize produces a JSON-safe, structurally stable snapshot", () => {
		const scene = buildFixtureScene();
		const timeline = buildFixtureTimeline();
		const first = serialize(scene, timeline);
		const json = JSON.stringify(first);
		expect(JSON.parse(json)).toEqual(first);
		expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		expect(first.timeline.tracks).toHaveLength(2);
	});

	test("serialize defaults to an empty timeline when omitted", () => {
		const first = serialize(buildFixtureScene());
		expect(first.timeline).toEqual({ tracks: [] });
	});

	test("deserialize(serialize(scene, timeline)) re-serializes to deep-equal JSON", () => {
		const scene = buildFixtureScene();
		const timeline = buildFixtureTimeline();
		const first = serialize(scene, timeline);
		const rebuilt = deserialize(first);
		const second = serialize(rebuilt.scene, rebuilt.timeline);
		expect(second).toEqual(first);
	});

	test("rehydrated scene has live, mutable signals", () => {
		const scene = buildFixtureScene();
		const rebuilt = deserialize(serialize(scene));
		const layer2d = rebuilt.scene.layers[0];
		if (!layer2d || layer2d.type !== "layer-2d") throw new Error("expected 2d layer");
		const firstChild = layer2d.children[0];
		if (!firstChild) throw new Error("expected child group");
		expect(firstChild.transform.kind).toBe("2d");
		if (firstChild.transform.kind !== "2d") throw new Error("unreachable");
		firstChild.transform.scaleX.set(10);
		expect(firstChild.transform.scaleX.get()).toBe(10);
	});

	test("rehydrated timeline is a live, mutable structure", () => {
		const scene = buildFixtureScene();
		const rebuilt = deserialize(serialize(scene, buildFixtureTimeline()));
		expect(rebuilt.timeline.tracks).toHaveLength(2);
		rebuilt.timeline.tracks[0]?.clips.push({
			id: "new",
			start: 9,
			end: 10,
			keyframes: [],
		});
		expect(rebuilt.timeline.tracks[0]?.clips).toHaveLength(3);
	});

	test("invalid payloads throw structured errors", () => {
		expect(() => deserialize({})).toThrow();
		expect(() => deserialize(null)).toThrow();
		expect(() => deserialize({ schemaVersion: 1, scene: { meta: {}, layers: [] } })).toThrow();
	});

	test("invalid timeline payloads throw", () => {
		const base = serialize(buildFixtureScene());
		expect(() =>
			deserialize({
				...base,
				timeline: {
					tracks: [
						{
							id: "bad",
							kind: "number",
							target: { nodeId: 42, property: "transform.x" },
							clips: [],
						},
					],
				},
			}),
		).toThrow();
		expect(() =>
			deserialize({
				...base,
				timeline: {
					tracks: [
						{
							id: "bad",
							kind: "number",
							target: { nodeId: "n", property: "transform.x" },
							clips: [
								{
									id: "c",
									start: 0,
									end: 1,
									keyframes: [{ time: 0, value: 0, easing: "bogus" }],
								},
							],
						},
					],
				},
			}),
		).toThrow();
	});

	test("unknown schemaVersion throws UnknownSchemaVersionError", () => {
		expect(() => deserialize({ schemaVersion: 99, scene: {}, timeline: { tracks: [] } })).toThrow(
			UnknownSchemaVersionError,
		);
	});

	test("invalid content-node payload (rect color missing a component) throws", () => {
		const base = serialize(buildFixtureScene());
		const broken = JSON.parse(JSON.stringify(base));
		// reach into the deep rect and truncate color
		broken.scene.layers[0].children[0].children[0].children[0].color = [0.1, 0.2];
		expect(() => deserialize(broken)).toThrow();
	});
});
