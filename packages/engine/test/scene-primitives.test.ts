import { describe, expect, test } from "bun:test";
import { CURRENT_SCHEMA_VERSION, deserialize, serialize } from "../src/project/index.ts";
import {
	createCircle,
	createLayer2D,
	createLayer3D,
	createLine,
	createScene,
	createText,
	createTransform2D,
	createTransform3D,
	NodeType,
	type Scene,
} from "../src/scene/index.ts";

const scenePrimitives2D = (): Scene =>
	createScene({
		meta: { name: "prim-2d", width: 800, height: 600, fps: 30, duration: 2 },
		layers: [
			createLayer2D({
				name: "2D",
				children: [
					createText({
						id: "t1",
						name: "Label",
						transform: createTransform2D({ x: 10, y: 20 }),
						text: "Hi",
						fontSize: 32,
						color: [0.5, 0.6, 0.7],
						align: "center",
					}),
					createCircle({
						id: "c1",
						name: "Dot",
						transform: createTransform2D({ x: -10 }),
						radius: 40,
						color: [1, 0, 0],
						stroke: [0, 0, 0],
						strokeWidth: 2,
					}),
					createLine({
						id: "l1",
						name: "Edge",
						transform: createTransform2D(),
						points: [
							[-50, 0, 0],
							[50, 0, 0],
							[60, 30, 0],
						],
						color: [0, 0.5, 1],
						width: 3,
					}),
				],
			}),
		],
	});

const scenePrimitives3D = (): Scene =>
	createScene({
		meta: { name: "prim-3d", width: 800, height: 600, fps: 30, duration: 2 },
		layers: [
			createLayer3D({
				name: "3D",
				children: [
					createText({
						id: "t3",
						name: "Label3D",
						transform: createTransform3D({ position: [0, 0, 0] }),
						text: "3D",
						fontSize: 24,
					}),
					createCircle({
						id: "c3",
						name: "Disc",
						transform: createTransform3D(),
						radius: 20,
					}),
					createLine({
						id: "l3",
						name: "Edge3D",
						transform: createTransform3D(),
						points: [
							[0, 0, -50],
							[0, 0, 50],
						],
					}),
				],
			}),
		],
	});

describe("primitives (text/circle/line) roundtrip", () => {
	test("2D variants round-trip through serialize/deserialize", () => {
		const first = serialize(scenePrimitives2D());
		expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		const rebuilt = deserialize(first);
		const layer = rebuilt.scene.layers[0];
		if (!layer) throw new Error("expected 2D layer");
		expect(layer.children.map((c) => c.type)).toEqual([
			NodeType.Text,
			NodeType.Circle,
			NodeType.Line,
		]);
		const second = serialize(rebuilt.scene, rebuilt.timeline);
		expect(second).toEqual(first);
	});

	test("3D variants round-trip through serialize/deserialize", () => {
		const first = serialize(scenePrimitives3D());
		expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		const rebuilt = deserialize(first);
		const layer = rebuilt.scene.layers[0];
		if (!layer) throw new Error("expected 3D layer");
		expect(layer.children.map((c) => c.type)).toEqual([
			NodeType.Text,
			NodeType.Circle,
			NodeType.Line,
		]);
		const second = serialize(rebuilt.scene, rebuilt.timeline);
		expect(second).toEqual(first);
	});

	test("migrateV3ToV4 is a no-op over payload structure", () => {
		const v4 = serialize(scenePrimitives2D());
		const v3 = { ...v4, schemaVersion: 3 };
		const rebuilt = deserialize(v3);
		const reserialized = serialize(rebuilt.scene, rebuilt.timeline);
		expect(reserialized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		expect(reserialized.scene).toEqual(v4.scene);
	});

	test("line with fewer than 2 points throws at factory", () => {
		expect(() => createLine({ transform: createTransform2D(), points: [[0, 0, 0]] })).toThrow();
	});
});
