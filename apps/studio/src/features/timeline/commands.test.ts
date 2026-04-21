import { describe, expect, test } from "bun:test";
import {
	type AudioTrack,
	type Clip,
	createAudioClip,
	createAudioTrack,
	createClip,
	createKeyframe,
	createTimeline,
	createTrack,
	EasingName,
	isAudioTrack,
	isNumberTrack,
	type Keyframe,
	type Timeline,
} from "@kut-kut/engine";
import type { Command } from "../../lib/commands/index.ts";
import {
	addAudioTrackCommand,
	moveAudioClipCommand,
	moveClipCommand,
	moveKeyframeCommand,
	removeAudioTrackCommand,
	resizeAudioClipLeftCommand,
	resizeAudioClipRightCommand,
	resizeClipLeftCommand,
	resizeClipRightCommand,
	setAudioTrackGainCommand,
	setAudioTrackMutedCommand,
	upsertKeyframeCommand,
} from "./commands.ts";
import type { Mutator } from "./store.ts";

const buildTimeline = (): Timeline =>
	createTimeline({
		tracks: [
			createTrack({
				id: "trk-x",
				target: { nodePath: ["L", "box"], property: "x" },
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

const mutatorFor =
	(tl: Timeline): Mutator =>
	(fn) =>
		fn(tl);

const snapshot = (tl: Timeline): string => JSON.stringify(tl);

const firstNumberClip = (tl: Timeline): Clip<number> | undefined => {
	const track = tl.tracks[0];
	if (!track || !isNumberTrack(track)) return undefined;
	return track.clips[0];
};

const runRoundTrip = (tl: Timeline, cmd: Command): void => {
	const before = snapshot(tl);
	cmd.apply();
	const after = snapshot(tl);
	expect(after).not.toBe(before);
	cmd.invert();
	expect(snapshot(tl)).toBe(before);
};

describe("moveClipCommand", () => {
	test("moves start + end preserving duration, inverts cleanly", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, moveClipCommand(mutatorFor(tl), "trk-x", "clp-a", 1, 2.25));
	});

	test("apply→invert→apply matches single apply", () => {
		const a = buildTimeline();
		const b = buildTimeline();
		const cmdA = moveClipCommand(mutatorFor(a), "trk-x", "clp-a", 1, 2);
		const cmdB = moveClipCommand(mutatorFor(b), "trk-x", "clp-a", 1, 2);
		cmdA.apply();
		cmdB.apply();
		cmdB.invert();
		cmdB.apply();
		expect(snapshot(a)).toBe(snapshot(b));
	});
});

describe("resizeClipLeftCommand", () => {
	test("shrinks from left: keyframes preserve absolute time", () => {
		const tl = buildTimeline();
		const cmd = resizeClipLeftCommand(mutatorFor(tl), "trk-x", "clp-a", 1, 1.75);
		cmd.apply();
		const clip = firstNumberClip(tl);
		expect(clip?.start).toBe(1.75);
		expect(clip?.keyframes.map((k) => k.time)).toEqual([-0.75, 0.25, 1.75]);
		cmd.invert();
		expect(clip?.start).toBe(1);
		expect(clip?.keyframes.map((k) => k.time)).toEqual([0, 1, 2.5]);
	});

	test("grows past original start: keyframes shift right in clip-local time", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, resizeClipLeftCommand(mutatorFor(tl), "trk-x", "clp-a", 1, 0.25));
	});
});

describe("resizeClipRightCommand", () => {
	test("shrinks from right without touching start or keyframes", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, resizeClipRightCommand(mutatorFor(tl), "trk-x", "clp-a", 4, 3));
	});
});

describe("moveKeyframeCommand", () => {
	test("moves without reorder", () => {
		const tl = buildTimeline();
		runRoundTrip(tl, moveKeyframeCommand(mutatorFor(tl), "trk-x", "clp-a", 1, 1, 1.4));
	});

	test("moves with reorder (index 1 past index 0)", () => {
		const tl = buildTimeline();
		const cmd = moveKeyframeCommand(mutatorFor(tl), "trk-x", "clp-a", 1, 1, -0.5);
		const before = snapshot(tl);
		cmd.apply();
		const kf0 = firstNumberClip(tl)?.keyframes[0];
		expect(kf0?.value).toBe(5);
		expect(kf0?.time).toBe(-0.5);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});

	test("moves with reorder (index 0 past index 2)", () => {
		const tl = buildTimeline();
		const cmd = moveKeyframeCommand(mutatorFor(tl), "trk-x", "clp-a", 0, 0, 3);
		const before = snapshot(tl);
		cmd.apply();
		const last = firstNumberClip(tl)?.keyframes[2];
		expect(last?.value).toBe(0);
		expect(last?.time).toBe(3);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});

const findAudioTrack = (tl: Timeline, id: string): AudioTrack | undefined => {
	const t = tl.tracks.find((tr) => tr.id === id);
	return t && isAudioTrack(t) ? t : undefined;
};

describe("addAudioTrackCommand", () => {
	test("apply appends, invert removes, roundtrip matches", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({
			id: "aud",
			clips: [createAudioClip({ id: "aclp", src: "voice.mp3", start: 0, end: 2 })],
		});
		const cmd = addAudioTrackCommand(mutatorFor(tl), track);
		const before = snapshot(tl);
		cmd.apply();
		expect(findAudioTrack(tl, "aud")?.clips[0]?.src).toBe("voice.mp3");
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});

	test("apply is idempotent when track id already present", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({ id: "aud" });
		const cmd = addAudioTrackCommand(mutatorFor(tl), track);
		cmd.apply();
		const after = snapshot(tl);
		cmd.apply();
		expect(snapshot(tl)).toBe(after);
	});
});

describe("removeAudioTrackCommand", () => {
	test("apply removes, invert restores the captured track", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({
			id: "aud",
			gain: 0.7,
			clips: [createAudioClip({ id: "aclp", src: "voice.mp3", start: 0, end: 2 })],
		});
		addAudioTrackCommand(mutatorFor(tl), track).apply();
		const mid = snapshot(tl);
		const cmd = removeAudioTrackCommand(mutatorFor(tl), "aud", track);
		cmd.apply();
		expect(findAudioTrack(tl, "aud")).toBeUndefined();
		cmd.invert();
		expect(snapshot(tl)).toBe(mid);
	});
});

describe("setAudioTrackGainCommand", () => {
	test("apply/invert roundtrip", () => {
		const tl = buildTimeline();
		addAudioTrackCommand(mutatorFor(tl), createAudioTrack({ id: "aud", gain: 1 })).apply();
		const before = snapshot(tl);
		const cmd = setAudioTrackGainCommand(mutatorFor(tl), "aud", 1, 0.5);
		cmd.apply();
		expect(findAudioTrack(tl, "aud")?.gain).toBe(0.5);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});

describe("setAudioTrackMutedCommand", () => {
	test("apply/invert roundtrip", () => {
		const tl = buildTimeline();
		addAudioTrackCommand(mutatorFor(tl), createAudioTrack({ id: "aud" })).apply();
		const before = snapshot(tl);
		const cmd = setAudioTrackMutedCommand(mutatorFor(tl), "aud", false, true);
		cmd.apply();
		expect(findAudioTrack(tl, "aud")?.muted).toBe(true);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});

const firstAudioClip = (tl: Timeline, trackId: string) => {
	const track = tl.tracks.find((tr) => tr.id === trackId);
	return track && isAudioTrack(track) ? track.clips[0] : undefined;
};

describe("moveAudioClipCommand", () => {
	test("shifts start + end, preserves offset, inverts cleanly", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({
			id: "aud",
			clips: [createAudioClip({ id: "aclp", src: "v.mp3", start: 1, end: 3, offset: 0.5 })],
		});
		addAudioTrackCommand(mutatorFor(tl), track).apply();
		const before = snapshot(tl);
		const cmd = moveAudioClipCommand(mutatorFor(tl), "aud", "aclp", 1, 2.25);
		cmd.apply();
		const clip = firstAudioClip(tl, "aud");
		expect(clip?.start).toBe(2.25);
		expect(clip?.end).toBe(4.25);
		expect(clip?.offset).toBe(0.5);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});

describe("resizeAudioClipLeftCommand", () => {
	test("trim-left shifts start + offset by same delta (non-slip)", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({
			id: "aud",
			clips: [createAudioClip({ id: "aclp", src: "v.mp3", start: 1, end: 3, offset: 0.2 })],
		});
		addAudioTrackCommand(mutatorFor(tl), track).apply();
		const before = snapshot(tl);
		const cmd = resizeAudioClipLeftCommand(mutatorFor(tl), "aud", "aclp", 1, 1.75);
		cmd.apply();
		const clip = firstAudioClip(tl, "aud");
		expect(clip?.start).toBe(1.75);
		expect(clip?.offset).toBe(0.95);
		expect(clip?.end).toBe(3);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});

	test("trim-left grown past original start shifts offset negatively", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({
			id: "aud",
			clips: [createAudioClip({ id: "aclp", src: "v.mp3", start: 1, end: 3, offset: 0.5 })],
		});
		addAudioTrackCommand(mutatorFor(tl), track).apply();
		const cmd = resizeAudioClipLeftCommand(mutatorFor(tl), "aud", "aclp", 1, 0.75);
		const before = snapshot(tl);
		cmd.apply();
		const clip = firstAudioClip(tl, "aud");
		expect(clip?.start).toBe(0.75);
		expect(clip?.offset).toBe(0.25);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});

describe("resizeAudioClipRightCommand", () => {
	test("trim-right moves end only, offset + start untouched", () => {
		const tl = buildTimeline();
		const track = createAudioTrack({
			id: "aud",
			clips: [createAudioClip({ id: "aclp", src: "v.mp3", start: 1, end: 3, offset: 0.4 })],
		});
		addAudioTrackCommand(mutatorFor(tl), track).apply();
		const before = snapshot(tl);
		const cmd = resizeAudioClipRightCommand(mutatorFor(tl), "aud", "aclp", 3, 2.5);
		cmd.apply();
		const clip = firstAudioClip(tl, "aud");
		expect(clip?.end).toBe(2.5);
		expect(clip?.start).toBe(1);
		expect(clip?.offset).toBe(0.4);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});

describe("upsertKeyframeCommand", () => {
	test("inserts a new keyframe at localTime; invert removes it", () => {
		const tl = buildTimeline();
		const cmd = upsertKeyframeCommand(
			mutatorFor(tl),
			"trk-x",
			"clp-a",
			1.5,
			null,
			EasingName.Linear,
			7,
		);
		const before = snapshot(tl);
		cmd.apply();
		const clip = firstNumberClip(tl);
		expect(clip?.keyframes.length).toBe(4);
		expect(clip?.keyframes.map((k) => k.time)).toEqual([0, 1, 1.5, 2.5]);
		expect(clip?.keyframes[2]?.value).toBe(7);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});

	test("updates an existing keyframe; invert restores value + easing", () => {
		const tl = buildTimeline();
		const prev: Keyframe<number> = { time: 1, value: 5, easing: EasingName.EaseInOutCubic };
		const cmd = upsertKeyframeCommand(
			mutatorFor(tl),
			"trk-x",
			"clp-a",
			1,
			prev,
			EasingName.Linear,
			99,
		);
		const before = snapshot(tl);
		cmd.apply();
		const clip = firstNumberClip(tl);
		expect(clip?.keyframes.length).toBe(3);
		expect(clip?.keyframes[1]?.value).toBe(99);
		cmd.invert();
		expect(snapshot(tl)).toBe(before);
	});
});
