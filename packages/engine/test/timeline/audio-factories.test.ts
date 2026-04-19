import { describe, expect, test } from "bun:test";
import {
	createAudioClip,
	createAudioTrack,
	isAudioTrack,
	isNumberTrack,
	TrackKind,
} from "../../src/timeline/index.ts";

describe("createAudioClip", () => {
	test("fills in defaults", () => {
		const clip = createAudioClip({ src: "assets/a.mp3", start: 0, end: 2 });
		expect(clip.src).toBe("assets/a.mp3");
		expect(clip.start).toBe(0);
		expect(clip.end).toBe(2);
		expect(clip.offset).toBe(0);
		expect(clip.gain).toBe(1);
		expect(clip.muted).toBe(false);
		expect(typeof clip.id).toBe("string");
	});

	test("overrides defaults when provided", () => {
		const clip = createAudioClip({
			id: "c1",
			src: "v.wav",
			start: 1,
			end: 3,
			offset: 0.5,
			gain: 0.4,
			muted: true,
		});
		expect(clip).toEqual({
			id: "c1",
			src: "v.wav",
			start: 1,
			end: 3,
			offset: 0.5,
			gain: 0.4,
			muted: true,
		});
	});

	test("rejects end < start", () => {
		expect(() => createAudioClip({ src: "a.mp3", start: 2, end: 1 })).toThrow();
	});
});

describe("createAudioTrack", () => {
	test("is an audio track by kind, with default mixer values", () => {
		const track = createAudioTrack();
		expect(track.kind).toBe(TrackKind.Audio);
		expect(track.clips).toEqual([]);
		expect(track.gain).toBe(1);
		expect(track.muted).toBe(false);
		expect(isAudioTrack(track)).toBe(true);
		expect(isNumberTrack(track)).toBe(false);
	});

	test("carries through clips, gain, and muted", () => {
		const clip = createAudioClip({ src: "a.mp3", start: 0, end: 1 });
		const track = createAudioTrack({ id: "t", clips: [clip], gain: 0.6, muted: true });
		expect(track.id).toBe("t");
		expect(track.clips).toEqual([clip]);
		expect(track.gain).toBe(0.6);
		expect(track.muted).toBe(true);
	});
});
