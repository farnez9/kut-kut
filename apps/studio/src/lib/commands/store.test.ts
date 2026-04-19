import { describe, expect, test } from "bun:test";
import { createRoot } from "solid-js";
import { createCommandStore } from "./store.ts";
import type { Command } from "./types.ts";

const runInRoot = (fn: () => void): void => {
	createRoot((dispose) => {
		fn();
		dispose();
	});
};

const counterCmd = (ref: { v: number }, delta: number, label = "inc"): Command => ({
	label,
	apply: () => {
		ref.v += delta;
	},
	invert: () => {
		ref.v -= delta;
	},
});

describe("createCommandStore", () => {
	test("push applies then undo reverts", () => {
		runInRoot(() => {
			const s = createCommandStore();
			const ref = { v: 0 };
			s.push(counterCmd(ref, 5));
			expect(ref.v).toBe(5);
			s.undo();
			expect(ref.v).toBe(0);
			s.redo();
			expect(ref.v).toBe(5);
		});
	});

	test("push after undo clears the future stack", () => {
		runInRoot(() => {
			const s = createCommandStore();
			const ref = { v: 0 };
			s.push(counterCmd(ref, 1, "a"));
			s.push(counterCmd(ref, 2, "b"));
			expect(ref.v).toBe(3);
			s.undo();
			expect(ref.v).toBe(1);
			expect(s.canRedo()).toBe(true);
			s.push(counterCmd(ref, 10, "c"));
			expect(ref.v).toBe(11);
			expect(s.canRedo()).toBe(false);
			s.undo();
			expect(ref.v).toBe(1);
			s.undo();
			expect(ref.v).toBe(0);
			expect(s.canUndo()).toBe(false);
		});
	});

	test("canUndo / canRedo reflect stack state", () => {
		runInRoot(() => {
			const s = createCommandStore();
			const ref = { v: 0 };
			expect(s.canUndo()).toBe(false);
			expect(s.canRedo()).toBe(false);
			s.push(counterCmd(ref, 1));
			expect(s.canUndo()).toBe(true);
			expect(s.canRedo()).toBe(false);
			s.undo();
			expect(s.canUndo()).toBe(false);
			expect(s.canRedo()).toBe(true);
		});
	});

	test("undo / redo on empty stacks are no-ops", () => {
		runInRoot(() => {
			const s = createCommandStore();
			const ref = { v: 7 };
			s.undo();
			s.redo();
			expect(ref.v).toBe(7);
		});
	});

	test("clear wipes both stacks", () => {
		runInRoot(() => {
			const s = createCommandStore();
			const ref = { v: 0 };
			s.push(counterCmd(ref, 1));
			s.push(counterCmd(ref, 2));
			s.undo();
			s.clear();
			expect(s.canUndo()).toBe(false);
			expect(s.canRedo()).toBe(false);
		});
	});

	test("cap trims past at 200 entries", () => {
		runInRoot(() => {
			const s = createCommandStore();
			const ref = { v: 0 };
			for (let i = 0; i < 250; i++) s.push(counterCmd(ref, 1));
			expect(ref.v).toBe(250);
			for (let i = 0; i < 200; i++) s.undo();
			expect(s.canUndo()).toBe(false);
			expect(ref.v).toBe(50);
		});
	});
});
