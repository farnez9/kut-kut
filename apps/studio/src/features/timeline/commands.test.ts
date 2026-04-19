import { describe, expect, test } from "bun:test";
import {
	createClip,
	createKeyframe,
	createTimeline,
	createTrack,
	EasingName,
	type Timeline,
} from "@kut-kut/engine";
import {
	type Command,
	moveClipCommand,
	moveKeyframeCommand,
	resizeClipLeftCommand,
	resizeClipRightCommand,
} from "./commands.ts";

const buildTimeline = (): Timeline =>
	createTimeline({
		tracks: [
			createTrack({
				id: "trk-x",
				target: { nodeId: "box", property: "x" },
				clips: [
					createClip({
						id: "clp-a",
						start: 1,
						end: 4,
						keyframes: [
							createKeyframe({ time: 0, value: 0, easing: EasingName.Linear }),
							createKeyframe({ time: 1, value: 5, easing: EasingName.EaseInOutCubic }),
							createKeyframe({ time: 2.5, value: 10, easing: EasingName.Linear }),
						],
					}),
				],
			}),
		],
	});

const snapshot = (tl: Timeline): string => JSON.stringify(tl);

const runRoundTrip = (tl: Timeline, cmd: Command): void => {
	const before = snapshot(tl);
	cmd.apply(tl);
	const after = snapshot(tl);
	expect(after).not.toBe(before);
	cmd.invert(tl);
	expect(snapshot(tl)).toBe(before);
};

describe("moveClipCommand", () => {
	test("moves start + end preserving duration, inverts cleanly", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, moveClipCommand("trk-x", "clp-a", 1, 2.25));
	});

	test("apply→invert→apply matches single apply", () => {
		const a = buildTimeline();
		const b = buildTimeline();
		const cmdA = moveClipCommand("trk-x", "clp-a", 1, 2);
		const cmdB = moveClipCommand("trk-x", "clp-a", 1, 2);
		cmdA.apply(a);
		cmdB.apply(b);
		cmdB.invert(b);
		cmdB.apply(b);
		expect(snapshot(a)).toBe(snapshot(b));
	});
});

describe("resizeClipLeftCommand", () => {
	test("shrinks from left: keyframes preserve absolute time", () => {
		const tl = buildTimeline();
		const cmd = resizeClipLeftCommand("trk-x", "clp-a", 1, 1.75);
		cmd.apply(tl);
		const clip = tl.tracks[0]?.clips[0];
		expect(clip?.start).toBe(1.75);
		expect(clip?.keyframes.map((k) => k.time)).toEqual([-0.75, 0.25, 1.75]);
		cmd.invert(tl);
		expect(clip?.start).toBe(1);
		expect(clip?.keyframes.map((k) => k.time)).toEqual([0, 1, 2.5]);
	});

	test("grows past original start: keyframes shift right in clip-local time", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, resizeClipLeftCommand("trk-x", "clp-a", 1, 0.25));
	});
});

describe("resizeClipRightCommand", () => {
	test("shrinks from right without touching start or keyframes", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, resizeClipRightCommand("trk-x", "clp-a", 4, 3));
	});
});

describe("moveKeyframeCommand", () => {
	test("moves without reorder", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, moveKeyframeCommand("trk-x", "clp-a", 1, 1, 1.4));
	});

	test("moves with reorder (index 1 past index 0)", () => {
		const tl = buildTimeline();
		const cmd = moveKeyframeCommand("trk-x", "clp-a", 1, 1, -0.5);
		const before = snapshot(tl);
		cmd.apply(tl);
		const kf0 = tl.tracks[0]?.clips[0]?.keyframes[0];
		expect(kf0?.value).toBe(5);
		expect(kf0?.time).toBe(-0.5);
		cmd.invert(tl);
		expect(snapshot(tl)).toBe(before);
	});

	test("moves with reorder (index 0 past index 2)", () => {
		const tl = buildTimeline();
		const cmd = moveKeyframeCommand("trk-x", "clp-a", 0, 0, 3);
		const before = snapshot(tl);
		cmd.apply(tl);
		const last = tl.tracks[0]?.clips[0]?.keyframes[2];
		expect(last?.value).toBe(0);
		expect(last?.time).toBe(3);
		cmd.invert(tl);
		expect(snapshot(tl)).toBe(before);
	});
});
