import { describe, expect, test } from "bun:test";
import {
	applyOverlay,
	applyOverlayMeta,
	CURRENT_OVERLAY_VERSION,
	emptyOverlay,
	type Overlay,
} from "../../src/overlay/index.ts";
import {
	createBox,
	createCircle,
	createLayer2D,
	createLayer3D,
	createLine,
	createRect,
	createScene,
	createText,
	createTransform2D,
	findNodeByPath,
	NodeType,
} from "../../src/scene/index.ts";

const build2DScene = () =>
	createScene({
		meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
		layers: [
			createLayer2D({
				name: "2D",
				children: [createRect({ name: "Hero", transform: { x: 10, y: 20, opacity: 1 } })],
			}),
		],
	});

const build3DScene = () =>
	createScene({
		meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
		layers: [
			createLayer3D({
				name: "3D",
				children: [
					createBox({
						name: "Cube",
						transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
					}),
				],
			}),
		],
	});

const overlayWith = (overrides: Overlay["overrides"]): Overlay => ({
	schemaVersion: CURRENT_OVERLAY_VERSION,
	overrides,
	additions: [],
	deletions: [],
});

describe("applyOverlay", () => {
	test("writes a scalar override through a dotted property path", () => {
		const scene = build2DScene();
		applyOverlay(
			scene,
			overlayWith([{ nodePath: ["2D", "Hero"], property: "transform.x", value: 500 }]),
		);
		const hero = findNodeByPath(scene, ["2D", "Hero"]);
		if (!hero || hero.transform.kind !== "2d") throw new Error("unreachable");
		expect(hero.transform.x.get()).toBe(500);
	});

	test("writes a vec3 override into a 3D transform slot", () => {
		const scene = build3DScene();
		applyOverlay(
			scene,
			overlayWith([
				{ nodePath: ["3D", "Cube"], property: "transform.position", value: [12, 34, 56] },
			]),
		);
		const cube = findNodeByPath(scene, ["3D", "Cube"]);
		if (!cube || cube.transform.kind !== "3d") throw new Error("unreachable");
		expect(cube.transform.position.get()).toEqual([12, 34, 56]);
	});

	test("silently skips unresolved node paths", () => {
		const scene = build2DScene();
		expect(() =>
			applyOverlay(
				scene,
				overlayWith([{ nodePath: ["2D", "Ghost"], property: "transform.x", value: 999 }]),
			),
		).not.toThrow();
		const hero = findNodeByPath(scene, ["2D", "Hero"]);
		if (!hero || hero.transform.kind !== "2d") throw new Error("unreachable");
		expect(hero.transform.x.get()).toBe(10);
	});

	test("silently skips type mismatches (vec3 value on scalar slot)", () => {
		const scene = build2DScene();
		expect(() =>
			applyOverlay(
				scene,
				overlayWith([{ nodePath: ["2D", "Hero"], property: "transform.x", value: [1, 2, 3] }]),
			),
		).not.toThrow();
		const hero = findNodeByPath(scene, ["2D", "Hero"]);
		if (!hero || hero.transform.kind !== "2d") throw new Error("unreachable");
		expect(hero.transform.x.get()).toBe(10);
	});

	test("silently skips unknown properties", () => {
		const scene = build2DScene();
		expect(() =>
			applyOverlay(
				scene,
				overlayWith([{ nodePath: ["2D", "Hero"], property: "transform.nope", value: 1 }]),
			),
		).not.toThrow();
	});

	test("empty overlay is a no-op", () => {
		const scene = build2DScene();
		applyOverlay(scene, emptyOverlay());
		const hero = findNodeByPath(scene, ["2D", "Hero"]);
		if (!hero || hero.transform.kind !== "2d") throw new Error("unreachable");
		expect(hero.transform.x.get()).toBe(10);
	});

	test("ignores meta override (handled separately by applyOverlayMeta)", () => {
		const scene = build2DScene();
		applyOverlay(scene, {
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [],
			additions: [],
			deletions: [],
			meta: { width: 1080, height: 1920 },
		});
		expect(scene.meta.width).toBe(100);
		expect(scene.meta.height).toBe(100);
	});

	test("writes a string override to a Text node's text property", () => {
		const scene = createScene({
			meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
			layers: [
				createLayer2D({
					name: "2D",
					children: [
						createText({
							name: "Label",
							transform: createTransform2D(),
							text: "original",
						}),
					],
				}),
			],
		});
		applyOverlay(
			scene,
			overlayWith([{ nodePath: ["2D", "Label"], property: "text", value: "updated" }]),
		);
		const label = findNodeByPath(scene, ["2D", "Label"]);
		if (!label || label.type !== NodeType.Text) throw new Error("unreachable");
		expect(label.text.get()).toBe("updated");
	});

	test("writes a Vec3[] override to a Line node's points property", () => {
		const scene = createScene({
			meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
			layers: [
				createLayer2D({
					name: "2D",
					children: [
						createLine({
							name: "Edge",
							transform: createTransform2D(),
							points: [
								[-10, 0, 0],
								[10, 0, 0],
							],
						}),
					],
				}),
			],
		});
		applyOverlay(
			scene,
			overlayWith([
				{
					nodePath: ["2D", "Edge"],
					property: "points",
					value: [
						[-50, 0, 0],
						[50, 0, 0],
						[60, 30, 0],
					],
				},
			]),
		);
		const edge = findNodeByPath(scene, ["2D", "Edge"]);
		if (!edge || edge.type !== NodeType.Line) throw new Error("unreachable");
		expect(edge.points.get()).toEqual([
			[-50, 0, 0],
			[50, 0, 0],
			[60, 30, 0],
		]);
	});

	test("writes a scalar override to a Circle's radius", () => {
		const scene = createScene({
			meta: { name: "t", width: 100, height: 100, fps: 30, duration: 1 },
			layers: [
				createLayer2D({
					name: "2D",
					children: [
						createCircle({
							name: "Disc",
							transform: createTransform2D(),
							radius: 10,
						}),
					],
				}),
			],
		});
		applyOverlay(scene, overlayWith([{ nodePath: ["2D", "Disc"], property: "radius", value: 42 }]));
		const disc = findNodeByPath(scene, ["2D", "Disc"]);
		if (!disc || disc.type !== NodeType.Circle) throw new Error("unreachable");
		expect(disc.radius.get()).toBe(42);
	});

	test("applies multiple overrides in order", () => {
		const scene = build2DScene();
		applyOverlay(
			scene,
			overlayWith([
				{ nodePath: ["2D", "Hero"], property: "transform.x", value: 1 },
				{ nodePath: ["2D", "Hero"], property: "transform.y", value: 2 },
				{ nodePath: ["2D", "Hero"], property: "transform.opacity", value: 0.5 },
			]),
		);
		const hero = findNodeByPath(scene, ["2D", "Hero"]);
		if (!hero || hero.transform.kind !== "2d") throw new Error("unreachable");
		expect(hero.transform.x.get()).toBe(1);
		expect(hero.transform.y.get()).toBe(2);
		expect(hero.transform.opacity.get()).toBe(0.5);
	});
});

describe("applyOverlayMeta", () => {
	const metaOverlayWith = (meta: Overlay["meta"]): Overlay => ({
		schemaVersion: CURRENT_OVERLAY_VERSION,
		overrides: [],
		additions: [],
		deletions: [],
		meta,
	});

	test("shallow-merges width and height", () => {
		const scene = build2DScene();
		applyOverlayMeta(scene, metaOverlayWith({ width: 1080, height: 1920 }));
		expect(scene.meta.width).toBe(1080);
		expect(scene.meta.height).toBe(1920);
		expect(scene.meta.fps).toBe(30);
		expect(scene.meta.duration).toBe(1);
	});

	test("leaves unspecified fields untouched", () => {
		const scene = build2DScene();
		applyOverlayMeta(scene, metaOverlayWith({ width: 1080 }));
		expect(scene.meta.width).toBe(1080);
		expect(scene.meta.height).toBe(100);
	});

	test("no-op when meta is absent", () => {
		const scene = build2DScene();
		applyOverlayMeta(scene, emptyOverlay());
		expect(scene.meta.width).toBe(100);
		expect(scene.meta.height).toBe(100);
	});

	test("merges fps and duration when provided", () => {
		const scene = build2DScene();
		applyOverlayMeta(scene, metaOverlayWith({ fps: 60, duration: 3 }));
		expect(scene.meta.fps).toBe(60);
		expect(scene.meta.duration).toBe(3);
	});
});
