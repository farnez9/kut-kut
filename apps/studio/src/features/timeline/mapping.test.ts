import { describe, expect, test } from "bun:test";
import { pickTickStep, pxToTime, timeToPx } from "./mapping.ts";

describe("timeToPx / pxToTime", () => {
	test("origin=0 maps time 0 to px 0", () => {
		expect(timeToPx(0, { zoom: 100, origin: 0 })).toBe(0);
	});

	test("time scales linearly with zoom", () => {
		expect(timeToPx(2, { zoom: 120, origin: 0 })).toBe(240);
		expect(timeToPx(2, { zoom: 60, origin: 0 })).toBe(120);
	});

	test("origin shifts the visible window", () => {
		expect(timeToPx(3, { zoom: 100, origin: 1 })).toBe(200);
		expect(pxToTime(200, { zoom: 100, origin: 1 })).toBe(3);
	});

	test("round-trips across varied zoom/origin", () => {
		const cases: { t: number; zoom: number; origin: number }[] = [
			{ t: 0, zoom: 40, origin: 0 },
			{ t: 4, zoom: 400, origin: 0 },
			{ t: 2.5, zoom: 150, origin: -1 },
			{ t: 10, zoom: 80, origin: 5 },
		];
		for (const c of cases) {
			const px = timeToPx(c.t, c);
			expect(pxToTime(px, c)).toBeCloseTo(c.t, 10);
		}
	});
});

describe("pickTickStep", () => {
	test("returns largest step whose span is >= 48 px", () => {
		expect(pickTickStep(4)).toBe(10);
		expect(pickTickStep(10)).toBe(5);
		expect(pickTickStep(25)).toBe(2);
		expect(pickTickStep(50)).toBe(1);
		expect(pickTickStep(150)).toBe(0.5);
		expect(pickTickStep(300)).toBe(0.2);
	});

	test("boundary: step is chosen when step*pxPerSec === 48", () => {
		expect(pickTickStep(48)).toBe(1);
		expect(pickTickStep(96)).toBe(0.5);
	});

	test("falls back to smallest candidate (0.1) when zoom is too high to satisfy", () => {
		expect(pickTickStep(10000)).toBe(0.1);
	});

	test("falls back to largest candidate when zoom is too low for any candidate to fit", () => {
		expect(pickTickStep(0.1)).toBe(10);
	});
});
