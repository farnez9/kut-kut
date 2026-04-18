import { describe, expect, test } from "bun:test";
import { EasingName } from "../../src/timeline/easing.ts";
import { evaluateClip, evaluateTrack } from "../../src/timeline/evaluate.ts";
import { createClip, createKeyframe, createTrack } from "../../src/timeline/factories.ts";

const target = { nodeId: "n", property: "transform.x" };

describe("evaluateClip", () => {
	test("returns undefined for an empty keyframe list", () => {
		const clip = createClip({ start: 0, end: 1 });
		expect(evaluateClip(clip, 0)).toBeUndefined();
		expect(evaluateClip(clip, 0.5)).toBeUndefined();
	});

	test("holds the first keyframe value before it", () => {
		const clip = createClip({
			start: 0,
			end: 2,
			keyframes: [
				createKeyframe({ time: 0.5, value: 10 }),
				createKeyframe({ time: 1.5, value: 20 }),
			],
		});
		expect(evaluateClip(clip, 0)).toBe(10);
		expect(evaluateClip(clip, 0.5)).toBe(10);
	});

	test("holds the last keyframe value after it", () => {
		const clip = createClip({
			start: 0,
			end: 2,
			keyframes: [
				createKeyframe({ time: 0.5, value: 10 }),
				createKeyframe({ time: 1.5, value: 20 }),
			],
		});
		expect(evaluateClip(clip, 1.5)).toBe(20);
		expect(evaluateClip(clip, 2)).toBe(20);
	});

	test("linearly interpolates between two keyframes", () => {
		const clip = createClip({
			start: 0,
			end: 1,
			keyframes: [
				createKeyframe({ time: 0, value: 0, easing: EasingName.Linear }),
				createKeyframe({ time: 1, value: 100, easing: EasingName.Linear }),
			],
		});
		expect(evaluateClip(clip, 0)).toBe(0);
		expect(evaluateClip(clip, 0.25)).toBeCloseTo(25, 10);
		expect(evaluateClip(clip, 0.5)).toBeCloseTo(50, 10);
		expect(evaluateClip(clip, 1)).toBe(100);
	});

	test("applies the outgoing keyframe's easing to the segment", () => {
		const clip = createClip({
			start: 0,
			end: 1,
			keyframes: [
				createKeyframe({ time: 0, value: 0, easing: EasingName.EaseInQuad }),
				createKeyframe({ time: 1, value: 10, easing: EasingName.Linear }),
			],
		});
		// ease-in-quad(0.5) = 0.25 → 0 + 10 * 0.25 = 2.5
		expect(evaluateClip(clip, 0.5)).toBeCloseTo(2.5, 10);
	});

	test("step-hold holds the outgoing value until the very end of the segment", () => {
		const clip = createClip({
			start: 0,
			end: 1,
			keyframes: [
				createKeyframe({ time: 0, value: 10, easing: EasingName.StepHold }),
				createKeyframe({ time: 1, value: 20 }),
			],
		});
		expect(evaluateClip(clip, 0)).toBe(10);
		expect(evaluateClip(clip, 0.5)).toBe(10);
		expect(evaluateClip(clip, 0.999)).toBe(10);
		expect(evaluateClip(clip, 1)).toBe(20);
	});
});

describe("evaluateTrack", () => {
	test("returns undefined outside all clips", () => {
		const track = createTrack({
			target,
			clips: [
				createClip({
					start: 1,
					end: 2,
					keyframes: [
						createKeyframe({ time: 0, value: 0 }),
						createKeyframe({ time: 1, value: 10 }),
					],
				}),
			],
		});
		expect(evaluateTrack(track, 0.5)).toBeUndefined();
		expect(evaluateTrack(track, 2.5)).toBeUndefined();
	});

	test("evaluates using clip-relative time", () => {
		const track = createTrack({
			target,
			clips: [
				createClip({
					start: 1,
					end: 2,
					keyframes: [
						createKeyframe({ time: 0, value: 0, easing: EasingName.Linear }),
						createKeyframe({ time: 1, value: 100, easing: EasingName.Linear }),
					],
				}),
			],
		});
		expect(evaluateTrack(track, 1)).toBe(0);
		expect(evaluateTrack(track, 1.5)).toBeCloseTo(50, 10);
		expect(evaluateTrack(track, 2)).toBe(100);
	});

	test("first clip wins on overlap", () => {
		const track = createTrack({
			target,
			clips: [
				createClip({
					id: "a",
					start: 0,
					end: 2,
					keyframes: [createKeyframe({ time: 0, value: 1 })],
				}),
				createClip({
					id: "b",
					start: 1,
					end: 3,
					keyframes: [createKeyframe({ time: 0, value: 99 })],
				}),
			],
		});
		expect(evaluateTrack(track, 1.5)).toBe(1);
		expect(evaluateTrack(track, 2.5)).toBe(99);
	});

	test("picks the next clip when the first has no keyframes", () => {
		const track = createTrack({
			target,
			clips: [
				createClip({ id: "empty", start: 0, end: 5 }),
				createClip({
					id: "real",
					start: 0,
					end: 5,
					keyframes: [createKeyframe({ time: 0, value: 42 })],
				}),
			],
		});
		expect(evaluateTrack(track, 1)).toBe(42);
	});
});
