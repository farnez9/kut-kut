import { describe, expect, test } from "bun:test";
import {
	createGroup,
	createLayer2D,
	createRect,
	createScene,
	createTransform2D,
} from "../src/scene/index.ts";

describe("sibling name uniqueness", () => {
	test("createLayer2D rejects two children with the same name", () => {
		expect(() =>
			createLayer2D({
				name: "2D",
				children: [createRect({ name: "A" }), createRect({ name: "A" })],
			}),
		).toThrow(/Duplicate child name "A"/);
	});

	test("createGroup rejects duplicate child names", () => {
		expect(() =>
			createGroup({
				name: "Stage",
				transform: createTransform2D(),
				children: [createRect({ name: "A" }), createRect({ name: "A" })],
			}),
		).toThrow(/Duplicate child name "A"/);
	});

	test("createScene rejects two layers with the same name", () => {
		const a = createLayer2D({ name: "Main" });
		const b = createLayer2D({ name: "Main" });
		expect(() => createScene({ layers: [a, b] })).toThrow(/Duplicate child name "Main"/);
	});

	test("siblings with distinct names are fine", () => {
		expect(() =>
			createLayer2D({
				name: "2D",
				children: [createRect({ name: "A" }), createRect({ name: "B" })],
			}),
		).not.toThrow();
	});

	test("duplicate names in different branches are allowed", () => {
		const left = createGroup({
			name: "Left",
			transform: createTransform2D(),
			children: [createRect({ name: "A" })],
		});
		const right = createGroup({
			name: "Right",
			transform: createTransform2D(),
			children: [createRect({ name: "A" })],
		});
		expect(() => createLayer2D({ name: "2D", children: [left, right] })).not.toThrow();
	});
});
