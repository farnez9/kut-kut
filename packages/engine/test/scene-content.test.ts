import { describe, expect, test } from "bun:test";
import {
	createBox,
	createGroup,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	createTransform2D,
	findNodeById,
	NodeType,
} from "../src/scene/index.ts";

describe("content primitives", () => {
	test("createRect applies defaults and reactive color", () => {
		const r = createRect();
		expect(r.type).toBe(NodeType.Rect);
		expect(r.name).toBe("Rect");
		expect(r.color.get()).toEqual([1, 1, 1]);
		expect(r.transform.x.get()).toBe(0);
		r.color.set([0.5, 0.25, 0.75]);
		expect(r.color.get()).toEqual([0.5, 0.25, 0.75]);
	});

	test("createRect honors overrides", () => {
		const r = createRect({ id: "r1", name: "bg", color: [1, 0, 0], transform: { x: 10 } });
		expect(r.id).toBe("r1");
		expect(r.name).toBe("bg");
		expect(r.color.get()).toEqual([1, 0, 0]);
		expect(r.transform.x.get()).toBe(10);
	});

	test("createBox applies defaults and reactive color", () => {
		const b = createBox();
		expect(b.type).toBe(NodeType.Box);
		expect(b.name).toBe("Box");
		expect(b.color.get()).toEqual([1, 1, 1]);
		expect(b.transform.position.get()).toEqual([0, 0, 0]);
		b.transform.position.set([1, 2, 3]);
		expect(b.transform.position.get()).toEqual([1, 2, 3]);
	});

	test("findNodeById reaches Rects and Boxes nested under groups", () => {
		const rect = createRect({ id: "rect-1" });
		const box = createBox({ id: "box-1" });
		const group2d = createGroup({
			id: "g2",
			transform: createTransform2D(),
			children: [rect],
		});
		const layer2d = createLayer2D({ id: "l2", children: [group2d] });
		const layer3d = createLayer3D({ id: "l3", children: [box] });
		const scene = createScene({ layers: [layer2d, layer3d] });

		expect(findNodeById(scene, "rect-1")).toBe(rect);
		expect(findNodeById(scene, "box-1")).toBe(box);
		expect(findNodeById(scene, "g2")).toBe(group2d);
		expect(findNodeById(scene, "missing")).toBeUndefined();
	});
});
