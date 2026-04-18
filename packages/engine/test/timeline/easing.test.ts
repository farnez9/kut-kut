import { describe, expect, test } from "bun:test";
import { EasingName, easings } from "../../src/timeline/easing.ts";

const SAMPLE_TS = Array.from({ length: 21 }, (_, i) => i / 20);

describe("easings", () => {
	test("every easing hits 0 at t=0 and 1 at t=1", () => {
		for (const name of Object.values(EasingName)) {
			const fn = easings[name];
			expect(fn(0)).toBeCloseTo(0, 10);
			expect(fn(1)).toBeCloseTo(1, 10);
		}
	});

	test("linear is the identity function on sampled points", () => {
		const linear = easings[EasingName.Linear];
		for (const t of SAMPLE_TS) {
			expect(linear(t)).toBeCloseTo(t, 10);
		}
	});

	test("smooth easings are monotonically non-decreasing on [0, 1]", () => {
		const smooth: EasingName[] = [
			EasingName.EaseInQuad,
			EasingName.EaseOutQuad,
			EasingName.EaseInOutQuad,
			EasingName.EaseInCubic,
			EasingName.EaseOutCubic,
			EasingName.EaseInOutCubic,
		];
		for (const name of smooth) {
			const fn = easings[name];
			let prev = fn(0);
			for (const t of SAMPLE_TS.slice(1)) {
				const curr = fn(t);
				expect(curr).toBeGreaterThanOrEqual(prev - 1e-12);
				prev = curr;
			}
		}
	});

	test("ease-in variants stay at or below linear; ease-out variants stay at or above", () => {
		const interior = SAMPLE_TS.slice(1, -1);
		for (const t of interior) {
			expect(easings[EasingName.EaseInQuad](t)).toBeLessThanOrEqual(t);
			expect(easings[EasingName.EaseInCubic](t)).toBeLessThanOrEqual(t);
			expect(easings[EasingName.EaseOutQuad](t)).toBeGreaterThanOrEqual(t);
			expect(easings[EasingName.EaseOutCubic](t)).toBeGreaterThanOrEqual(t);
		}
	});

	test("in-out easings cross linear at the midpoint", () => {
		expect(easings[EasingName.EaseInOutQuad](0.5)).toBeCloseTo(0.5, 10);
		expect(easings[EasingName.EaseInOutCubic](0.5)).toBeCloseTo(0.5, 10);
	});

	test("step-hold is piecewise: 0 until t=1, then 1", () => {
		const step = easings[EasingName.StepHold];
		expect(step(0)).toBe(0);
		expect(step(0.25)).toBe(0);
		expect(step(0.999_999)).toBe(0);
		expect(step(1)).toBe(1);
	});
});
