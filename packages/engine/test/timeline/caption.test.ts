import { describe, expect, test } from "bun:test";
import { evaluateCaptionTrack } from "../../src/timeline/evaluate.ts";
import { createCaptionClip, createCaptionTrack } from "../../src/timeline/factories.ts";
import { isCaptionTrack, isNumberTrack, TrackKind } from "../../src/timeline/types.ts";

describe("createCaptionClip", () => {
	test("fills in defaults", () => {
		const clip = createCaptionClip({ start: 0, end: 2 });
		expect(clip.start).toBe(0);
		expect(clip.end).toBe(2);
		expect(clip.text).toBe("");
		expect(typeof clip.id).toBe("string");
	});

	test("carries through provided fields", () => {
		const clip = createCaptionClip({ id: "c", start: 1, end: 3, text: "hello" });
		expect(clip).toEqual({ id: "c", start: 1, end: 3, text: "hello" });
	});

	test("rejects end < start", () => {
		expect(() => createCaptionClip({ start: 2, end: 1 })).toThrow();
	});
});

describe("createCaptionTrack", () => {
	test("is a caption track by kind", () => {
		const track = createCaptionTrack();
		expect(track.kind).toBe(TrackKind.Caption);
		expect(track.clips).toEqual([]);
		expect(isCaptionTrack(track)).toBe(true);
		expect(isNumberTrack(track)).toBe(false);
	});

	test("carries clips through", () => {
		const clip = createCaptionClip({ start: 0, end: 1, text: "hi" });
		const track = createCaptionTrack({ id: "t", clips: [clip] });
		expect(track.id).toBe("t");
		expect(track.clips).toEqual([clip]);
	});
});

describe("evaluateCaptionTrack", () => {
	test("returns undefined before and after all clips", () => {
		const track = createCaptionTrack({
			clips: [createCaptionClip({ start: 1, end: 2, text: "a" })],
		});
		expect(evaluateCaptionTrack(track, 0)).toBeUndefined();
		expect(evaluateCaptionTrack(track, 2.5)).toBeUndefined();
	});

	test("includes start, excludes end (half-open interval)", () => {
		const track = createCaptionTrack({
			clips: [createCaptionClip({ id: "x", start: 1, end: 2, text: "a" })],
		});
		expect(evaluateCaptionTrack(track, 1)?.id).toBe("x");
		expect(evaluateCaptionTrack(track, 1.5)?.id).toBe("x");
		expect(evaluateCaptionTrack(track, 2)).toBeUndefined();
	});

	test("on overlap, the later-starting clip wins", () => {
		const track = createCaptionTrack({
			clips: [
				createCaptionClip({ id: "a", start: 0, end: 4, text: "a" }),
				createCaptionClip({ id: "b", start: 2, end: 3, text: "b" }),
			],
		});
		expect(evaluateCaptionTrack(track, 1)?.id).toBe("a");
		expect(evaluateCaptionTrack(track, 2.5)?.id).toBe("b");
		expect(evaluateCaptionTrack(track, 3.5)?.id).toBe("a");
	});
});
