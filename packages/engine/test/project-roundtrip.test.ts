import { describe, expect, test } from "bun:test";
import {
	CURRENT_SCHEMA_VERSION,
	deserialize,
	serialize,
	UnknownSchemaVersionError,
} from "../src/project/index.ts";
import {
	createGroup,
	createLayer2D,
	createLayer3D,
	createScene,
	createTransform2D,
	createTransform3D,
} from "../src/scene/index.ts";

const buildFixtureScene = () => {
	const deepGroup = createGroup({
		id: "g-deep",
		name: "deep",
		transform: createTransform2D({ x: 5, y: -3, opacity: 0.25 }),
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

describe("project roundtrip", () => {
	test("serialize produces a JSON-safe, structurally stable snapshot", () => {
		const scene = buildFixtureScene();
		const first = serialize(scene);
		const json = JSON.stringify(first);
		expect(JSON.parse(json)).toEqual(first);
		expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		expect(first.timeline).toBeNull();
	});

	test("deserialize(serialize(scene)) re-serializes to deep-equal JSON", () => {
		const scene = buildFixtureScene();
		const first = serialize(scene);
		const rebuilt = deserialize(first);
		const second = serialize(rebuilt);
		expect(second).toEqual(first);
	});

	test("rehydrated scene has live, mutable signals", () => {
		const scene = buildFixtureScene();
		const rebuilt = deserialize(serialize(scene));
		const layer2d = rebuilt.layers[0];
		if (!layer2d || layer2d.type !== "layer-2d") throw new Error("expected 2d layer");
		const firstChild = layer2d.children[0];
		if (!firstChild) throw new Error("expected child group");
		expect(firstChild.transform.kind).toBe("2d");
		if (firstChild.transform.kind !== "2d") throw new Error("unreachable");
		firstChild.transform.scaleX.set(10);
		expect(firstChild.transform.scaleX.get()).toBe(10);
	});

	test("invalid payloads throw structured errors", () => {
		expect(() => deserialize({})).toThrow();
		expect(() => deserialize(null)).toThrow();
		expect(() => deserialize({ schemaVersion: 1, scene: { meta: {}, layers: [] } })).toThrow();
	});

	test("unknown schemaVersion throws UnknownSchemaVersionError", () => {
		expect(() => deserialize({ schemaVersion: 99, scene: {}, timeline: null })).toThrow(
			UnknownSchemaVersionError,
		);
	});
});
