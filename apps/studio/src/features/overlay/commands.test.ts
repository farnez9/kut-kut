import { describe, expect, test } from "bun:test";
import { emptyOverlay, type Overlay } from "@kut-kut/engine";
import {
	addNodeCommand,
	deleteNodeCommand,
	overrideValuesEqual,
	restoreNodeCommand,
	setOverrideCommand,
} from "./commands.ts";
import type { OverlayMutator } from "./store.ts";

const mutatorFor =
	(o: Overlay): OverlayMutator =>
	(fn) =>
		fn(o);

const snapshot = (o: Overlay): string => JSON.stringify(o);

describe("overrideValuesEqual", () => {
	test("numbers compare value-wise", () => {
		expect(overrideValuesEqual(1, 1)).toBe(true);
		expect(overrideValuesEqual(1, 2)).toBe(false);
	});

	test("vec3 triples compare element-wise", () => {
		expect(overrideValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
		expect(overrideValuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
	});

	test("undefined only equals undefined", () => {
		expect(overrideValuesEqual(undefined, undefined)).toBe(true);
		expect(overrideValuesEqual(undefined, 0)).toBe(false);
		expect(overrideValuesEqual(0, undefined)).toBe(false);
	});
});

describe("setOverrideCommand", () => {
	test("insert from nothing, invert removes", () => {
		const o = emptyOverlay();
		const cmd = setOverrideCommand(mutatorFor(o), ["L", "r"], "transform.x", undefined, 10);
		const before = snapshot(o);
		cmd.apply();
		expect(o.overrides.length).toBe(1);
		expect(o.overrides[0]?.value).toBe(10);
		cmd.invert();
		expect(snapshot(o)).toBe(before);
	});

	test("update existing, invert restores prev", () => {
		const o = emptyOverlay();
		o.overrides.push({ nodePath: ["L", "r"], property: "transform.x", value: 5 });
		const cmd = setOverrideCommand(mutatorFor(o), ["L", "r"], "transform.x", 5, 42);
		const before = snapshot(o);
		cmd.apply();
		expect(o.overrides[0]?.value).toBe(42);
		cmd.invert();
		expect(snapshot(o)).toBe(before);
	});

	test("clear existing (next=undefined), invert re-adds", () => {
		const o = emptyOverlay();
		o.overrides.push({ nodePath: ["L", "r"], property: "transform.x", value: 5 });
		const cmd = setOverrideCommand(mutatorFor(o), ["L", "r"], "transform.x", 5, undefined);
		const before = snapshot(o);
		cmd.apply();
		expect(o.overrides.length).toBe(0);
		cmd.invert();
		expect(snapshot(o)).toBe(before);
	});
});

describe("addNodeCommand", () => {
	test("adds an entry, invert removes by (parentPath, name)", () => {
		const o = emptyOverlay();
		const cmd = addNodeCommand(mutatorFor(o), {
			parentPath: ["L"],
			name: "Rect 2",
			kind: "rect",
		});
		const before = snapshot(o);
		cmd.apply();
		expect(o.additions.length).toBe(1);
		expect(o.additions[0]?.name).toBe("Rect 2");
		cmd.invert();
		expect(snapshot(o)).toBe(before);
	});

	test("apply is a no-op if a matching entry already exists", () => {
		const o = emptyOverlay();
		o.additions.push({ parentPath: ["L"], name: "Rect 2", kind: "rect" });
		const cmd = addNodeCommand(mutatorFor(o), {
			parentPath: ["L"],
			name: "Rect 2",
			kind: "rect",
		});
		const before = snapshot(o);
		cmd.apply();
		expect(snapshot(o)).toBe(before);
	});
});

describe("deleteNodeCommand", () => {
	test("pushes a deletion, invert removes it", () => {
		const o = emptyOverlay();
		const cmd = deleteNodeCommand(mutatorFor(o), ["L", "r"]);
		const before = snapshot(o);
		cmd.apply();
		expect(o.deletions.length).toBe(1);
		cmd.invert();
		expect(snapshot(o)).toBe(before);
	});

	test("apply is a no-op if already deleted", () => {
		const o = emptyOverlay();
		o.deletions.push({ path: ["L", "r"] });
		const cmd = deleteNodeCommand(mutatorFor(o), ["L", "r"]);
		const before = snapshot(o);
		cmd.apply();
		expect(snapshot(o)).toBe(before);
	});
});

describe("restoreNodeCommand", () => {
	test("removes a deletion, invert puts it back", () => {
		const o = emptyOverlay();
		o.deletions.push({ path: ["L", "r"] });
		const cmd = restoreNodeCommand(mutatorFor(o), ["L", "r"]);
		const before = snapshot(o);
		cmd.apply();
		expect(o.deletions.length).toBe(0);
		cmd.invert();
		expect(snapshot(o)).toBe(before);
	});
});
