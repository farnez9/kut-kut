import { describe, expect, test } from "bun:test";
import {
	applyOverlay,
	CURRENT_OVERLAY_VERSION,
	emptyOverlay,
	type Overlay,
} from "../../src/overlay/index.ts";
import {
	createBox,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	findNodeByPath,
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
