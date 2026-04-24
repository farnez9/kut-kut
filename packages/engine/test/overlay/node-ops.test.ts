import { describe, expect, test } from "bun:test";
import { applyNodeOps, CURRENT_OVERLAY_VERSION, type Overlay } from "../../src/overlay/index.ts";
import {
	createBox,
	createGroup,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	createTransform2D,
	createTransform3D,
	findNodeByPath,
	NodeType,
} from "../../src/scene/index.ts";

const build2DScene = () =>
	createScene({
		meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
		layers: [
			createLayer2D({
				name: "2D",
				children: [createRect({ name: "Hero" })],
			}),
		],
	});

const build3DScene = () =>
	createScene({
		meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
		layers: [
			createLayer3D({
				name: "3D",
				children: [createBox({ name: "Cube" })],
			}),
		],
	});

const buildMixedScene = () =>
	createScene({
		meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
		layers: [
			createLayer2D({
				name: "2D",
				children: [
					createGroup({
						name: "Crew",
						transform: createTransform2D(),
						children: [createRect({ name: "Hero" }), createRect({ name: "Sidekick" })],
					}),
				],
			}),
			createLayer3D({
				name: "3D",
				children: [
					createGroup({
						name: "Vehicles",
						transform: createTransform3D(),
						children: [createBox({ name: "Cube" })],
					}),
				],
			}),
		],
	});

const overlay = (partial: Partial<Overlay> = {}): Overlay => ({
	schemaVersion: CURRENT_OVERLAY_VERSION,
	overrides: [],
	additions: [],
	deletions: [],
	...partial,
});

describe("applyNodeOps — additions", () => {
	test("adds a rect under a 2D layer", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({ additions: [{ parentPath: ["2D"], name: "Extra", kind: "rect" }] }),
		);
		const extra = findNodeByPath(scene, ["2D", "Extra"]);
		expect(extra?.type).toBe(NodeType.Rect);
		expect(extra?.transform.kind).toBe("2d");
	});

	test("adds a box under a 3D group", () => {
		const scene = buildMixedScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [{ parentPath: ["3D", "Vehicles"], name: "Sphere", kind: "box" }],
			}),
		);
		const sphere = findNodeByPath(scene, ["3D", "Vehicles", "Sphere"]);
		expect(sphere?.type).toBe(NodeType.Box);
		expect(sphere?.transform.kind).toBe("3d");
	});

	test("adds a group and inherits parent transform kind", () => {
		const scene = buildMixedScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [
					{ parentPath: ["2D"], name: "NestedCrew", kind: "group" },
					{ parentPath: ["3D"], name: "NestedRig", kind: "group" },
				],
			}),
		);
		const twoDGroup = findNodeByPath(scene, ["2D", "NestedCrew"]);
		const threeDGroup = findNodeByPath(scene, ["3D", "NestedRig"]);
		expect(twoDGroup?.type).toBe(NodeType.Group);
		expect(twoDGroup?.transform.kind).toBe("2d");
		expect(threeDGroup?.type).toBe(NodeType.Group);
		expect(threeDGroup?.transform.kind).toBe("3d");
	});

	test("silently skips mismatched kind (rect under 3D parent)", () => {
		const scene = build3DScene();
		applyNodeOps(
			scene,
			overlay({ additions: [{ parentPath: ["3D"], name: "Ghost", kind: "rect" }] }),
		);
		expect(findNodeByPath(scene, ["3D", "Ghost"])).toBeUndefined();
	});

	test("silently skips an unresolved parent", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({ additions: [{ parentPath: ["Nope"], name: "Extra", kind: "rect" }] }),
		);
		expect(findNodeByPath(scene, ["Nope", "Extra"])).toBeUndefined();
	});

	test("adds text/circle/line primitives under a 2D layer", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [
					{ parentPath: ["2D"], name: "Label", kind: "text" },
					{ parentPath: ["2D"], name: "Disc", kind: "circle" },
					{ parentPath: ["2D"], name: "Edge", kind: "line" },
				],
			}),
		);
		expect(findNodeByPath(scene, ["2D", "Label"])?.type).toBe(NodeType.Text);
		expect(findNodeByPath(scene, ["2D", "Disc"])?.type).toBe(NodeType.Circle);
		expect(findNodeByPath(scene, ["2D", "Edge"])?.type).toBe(NodeType.Line);
	});

	test("adds text/circle/line primitives under a 3D layer", () => {
		const scene = build3DScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [
					{ parentPath: ["3D"], name: "Label3D", kind: "text" },
					{ parentPath: ["3D"], name: "Disc3D", kind: "circle" },
					{ parentPath: ["3D"], name: "Edge3D", kind: "line" },
				],
			}),
		);
		expect(findNodeByPath(scene, ["3D", "Label3D"])?.transform.kind).toBe("3d");
		expect(findNodeByPath(scene, ["3D", "Disc3D"])?.transform.kind).toBe("3d");
		expect(findNodeByPath(scene, ["3D", "Edge3D"])?.transform.kind).toBe("3d");
	});

	test("adds an image with src/width/height under a 2D layer", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [
					{
						parentPath: ["2D"],
						name: "Sprite",
						kind: "image",
						src: "assets/sprite.png",
						width: 320,
						height: 200,
					},
				],
			}),
		);
		const sprite = findNodeByPath(scene, ["2D", "Sprite"]);
		expect(sprite?.type).toBe(NodeType.Image);
		expect(sprite?.transform.kind).toBe("2d");
		if (sprite?.type !== NodeType.Image) throw new Error("unreachable");
		expect(sprite.src.get()).toBe("assets/sprite.png");
		expect(sprite.width.get()).toBe(320);
		expect(sprite.height.get()).toBe(200);
	});

	test("silently skips an image addition without src", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [{ parentPath: ["2D"], name: "Sprite", kind: "image" }],
			}),
		);
		expect(findNodeByPath(scene, ["2D", "Sprite"])).toBeUndefined();
	});

	test("silently skips an addition whose name collides with an existing sibling", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({ additions: [{ parentPath: ["2D"], name: "Hero", kind: "rect" }] }),
		);
		const hero = findNodeByPath(scene, ["2D", "Hero"]);
		expect(hero).toBeDefined();
		// Only one Hero in children
		if (!hero || !("type" in hero)) throw new Error("unreachable");
		const layer = findNodeByPath(scene, ["2D"]);
		if (!layer || !("children" in layer)) throw new Error("unreachable");
		expect(layer.children.filter((c) => c.name === "Hero")).toHaveLength(1);
	});
});

describe("applyNodeOps — deletions", () => {
	test("removes a child from its parent", () => {
		const scene = build2DScene();
		applyNodeOps(scene, overlay({ deletions: [{ path: ["2D", "Hero"] }] }));
		expect(findNodeByPath(scene, ["2D", "Hero"])).toBeUndefined();
	});

	test("cascades — deleting a group removes its children too", () => {
		const scene = buildMixedScene();
		applyNodeOps(scene, overlay({ deletions: [{ path: ["2D", "Crew"] }] }));
		expect(findNodeByPath(scene, ["2D", "Crew"])).toBeUndefined();
		expect(findNodeByPath(scene, ["2D", "Crew", "Hero"])).toBeUndefined();
	});

	test("silently skips unresolved paths", () => {
		const scene = build2DScene();
		expect(() =>
			applyNodeOps(scene, overlay({ deletions: [{ path: ["2D", "Ghost"] }] })),
		).not.toThrow();
		expect(findNodeByPath(scene, ["2D", "Hero"])).toBeDefined();
	});

	test("removes a whole layer when its name is the entire path", () => {
		const scene = build2DScene();
		applyNodeOps(scene, overlay({ deletions: [{ path: ["2D"] }] }));
		expect(findNodeByPath(scene, ["2D"])).toBeUndefined();
	});
});

describe("applyNodeOps — ordering and idempotence", () => {
	test("deletion at a path wins over an addition at the same path", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [{ parentPath: ["2D"], name: "AddedRect", kind: "rect" }],
				deletions: [{ path: ["2D", "AddedRect"] }],
			}),
		);
		expect(findNodeByPath(scene, ["2D", "AddedRect"])).toBeUndefined();
	});

	test("deletion removes an authored node even when overlay also adds at the same path", () => {
		const scene = build2DScene();
		applyNodeOps(
			scene,
			overlay({
				additions: [{ parentPath: ["2D"], name: "Hero", kind: "rect" }],
				deletions: [{ path: ["2D", "Hero"] }],
			}),
		);
		expect(findNodeByPath(scene, ["2D", "Hero"])).toBeUndefined();
	});

	test("re-running is a no-op for idempotent overlays", () => {
		const scene = build2DScene();
		const ops = overlay({
			additions: [{ parentPath: ["2D"], name: "Extra", kind: "rect" }],
			deletions: [{ path: ["2D", "Hero"] }],
		});
		applyNodeOps(scene, ops);
		const firstPass = findNodeByPath(scene, ["2D"]);
		if (!firstPass || !("children" in firstPass)) throw new Error("unreachable");
		const firstCount = firstPass.children.length;

		applyNodeOps(scene, ops);
		const secondPass = findNodeByPath(scene, ["2D"]);
		if (!secondPass || !("children" in secondPass)) throw new Error("unreachable");
		expect(secondPass.children.length).toBe(firstCount);
	});
});
