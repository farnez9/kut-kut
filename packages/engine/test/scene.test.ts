import { describe, expect, test } from "bun:test";
import {
	createGroup,
	createLayer2D,
	createLayer3D,
	createScene,
	createTransform2D,
	createTransform3D,
	NodeType,
	TransformKind,
} from "../src/scene/index.ts";

describe("scene graph", () => {
	test("createScene applies default meta", () => {
		const scene = createScene();
		expect(scene.meta).toEqual({
			name: "Untitled",
			width: 1920,
			height: 1080,
			fps: 30,
			duration: 10,
		});
		expect(scene.layers).toEqual([]);
	});

	test("createLayer2D builds a 2D layer with signal-backed properties", () => {
		const layer = createLayer2D({ name: "bg", transform: { x: 10, opacity: 0.5 } });
		expect(layer.type).toBe(NodeType.Layer2D);
		expect(layer.transform.kind).toBe(TransformKind.TwoD);
		expect(layer.transform.x.get()).toBe(10);
		expect(layer.transform.opacity.get()).toBe(0.5);
		expect(layer.transform.y.get()).toBe(0);
	});

	test("createLayer3D builds a 3D layer with vector defaults", () => {
		const layer = createLayer3D({ transform: { position: [1, 2, 3] } });
		expect(layer.type).toBe(NodeType.Layer3D);
		expect(layer.transform.kind).toBe(TransformKind.ThreeD);
		expect(layer.transform.position.get()).toEqual([1, 2, 3]);
		expect(layer.transform.scale.get()).toEqual([1, 1, 1]);
	});

	test("property.set updates the reactive value", () => {
		const layer = createLayer2D();
		layer.transform.x.set(42);
		expect(layer.transform.x.get()).toBe(42);
		expect(layer.transform.x.initial).toBe(0);
	});

	test("groups nest under layers", () => {
		const inner = createGroup({ transform: createTransform2D(), name: "inner" });
		const outer = createGroup({
			transform: createTransform2D(),
			name: "outer",
			children: [inner],
		});
		const layer = createLayer2D({ children: [outer] });
		expect(layer.children[0]).toBe(outer);
		expect(layer.children[0]?.children[0]).toBe(inner);
	});

	test("ids default to unique UUIDs and can be overridden", () => {
		const a = createGroup({ transform: createTransform2D() });
		const b = createGroup({ transform: createTransform2D() });
		expect(a.id).not.toBe(b.id);
		const c = createGroup({ id: "fixed", transform: createTransform3D() });
		expect(c.id).toBe("fixed");
	});
});
