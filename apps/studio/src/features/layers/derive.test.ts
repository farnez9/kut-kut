import { describe, expect, test } from "bun:test";
import {
	CURRENT_OVERLAY_VERSION,
	createGroup,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	createTransform2D,
	type Overlay,
} from "@kut-kut/engine";
import { deriveLayerTree, pickUniqueName } from "./derive.ts";

const overlay = (partial: Partial<Overlay> = {}): Overlay => ({
	schemaVersion: CURRENT_OVERLAY_VERSION,
	overrides: [],
	additions: [],
	deletions: [],
	...partial,
});

const buildScene = () =>
	createScene({
		meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
		layers: [
			createLayer2D({
				name: "2D",
				children: [
					createRect({ name: "Hero" }),
					createGroup({
						name: "Crew",
						transform: createTransform2D(),
						children: [createRect({ name: "Sidekick" })],
					}),
				],
			}),
			createLayer3D({ name: "3D" }),
		],
	});

describe("deriveLayerTree", () => {
	test("renders author tree verbatim with empty overlay", () => {
		const scene = buildScene();
		const tree = deriveLayerTree(scene, overlay());
		expect(tree).toHaveLength(2);
		expect(tree[0]!.node.name).toBe("2D");
		expect(tree[0]!.nodePath).toEqual(["2D"]);
		expect(tree[0]!.source).toBe("author");
		expect(tree[0]!.children.map((c) => c.node.name)).toEqual(["Hero", "Crew"]);
		expect(tree[0]!.children[1]!.children.map((c) => c.node.name)).toEqual(["Sidekick"]);
	});

	test("renders additions alongside author children under parent path", () => {
		const scene = buildScene();
		const tree = deriveLayerTree(
			scene,
			overlay({
				additions: [{ parentPath: ["2D"], name: "Extra", kind: "rect" }],
			}),
		);
		const layer = tree[0]!;
		expect(layer.children.map((c) => c.node.name)).toEqual(["Hero", "Crew", "Extra"]);
		const extra = layer.children.find((c) => c.node.name === "Extra")!;
		expect(extra.source).toBe("added");
	});

	test("marks deleted nodes with deleted: true and propagates to descendants", () => {
		const scene = buildScene();
		const tree = deriveLayerTree(scene, overlay({ deletions: [{ path: ["2D", "Crew"] }] }));
		const crew = tree[0]!.children.find((c) => c.node.name === "Crew")!;
		expect(crew.deleted).toBe(true);
		expect(crew.deletedAncestor).toBe(false);
		expect(crew.children[0]!.deleted).toBe(false);
		expect(crew.children[0]!.deletedAncestor).toBe(true);
	});

	test("hides duplicate-name additions (collision with author sibling)", () => {
		const scene = buildScene();
		const tree = deriveLayerTree(
			scene,
			overlay({
				additions: [{ parentPath: ["2D"], name: "Hero", kind: "rect" }],
			}),
		);
		const heroes = tree[0]!.children.filter((c) => c.node.name === "Hero");
		expect(heroes).toHaveLength(1);
	});

	test("skips additions whose kind mismatches the parent transform", () => {
		const scene = buildScene();
		const tree = deriveLayerTree(
			scene,
			overlay({ additions: [{ parentPath: ["3D"], name: "Ghost", kind: "rect" }] }),
		);
		const threeD = tree[1]!;
		expect(threeD.children.find((c) => c.node.name === "Ghost")).toBeUndefined();
	});
});

describe("pickUniqueName", () => {
	test("returns base when unused", () => {
		expect(pickUniqueName([], "Rect")).toBe("Rect");
		expect(pickUniqueName(["Hero"], "Rect")).toBe("Rect");
	});

	test("returns base + 2 when base taken", () => {
		expect(pickUniqueName(["Rect"], "Rect")).toBe("Rect 2");
	});

	test("skips taken numbered names", () => {
		expect(pickUniqueName(["Rect", "Rect 2"], "Rect")).toBe("Rect 3");
	});

	test("fills first gap", () => {
		expect(pickUniqueName(["Rect", "Rect 3"], "Rect")).toBe("Rect 2");
	});
});
