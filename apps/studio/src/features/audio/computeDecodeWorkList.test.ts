import { describe, expect, test } from "bun:test";
import {
	createAudioClip,
	createAudioTrack,
	createClip,
	createTrack,
	type Track,
} from "@kut-kut/engine";
import { computeDecodeWorkList } from "./computeDecodeWorkList.ts";

const numberTrack = (): Track =>
	createTrack({
		id: "num",
		target: { nodePath: ["L", "r"], property: "x" },
		clips: [createClip({ id: "c", start: 0, end: 1, keyframes: [] })],
	});

const audio = (id: string, srcs: string[]): Track =>
	createAudioTrack({
		id,
		clips: srcs.map((src, i) => createAudioClip({ id: `${id}-${i}`, src, start: 0, end: 1 })),
	});

describe("computeDecodeWorkList", () => {
	test("returns srcs referenced by audio clips and not already decoded", () => {
		const tracks: Track[] = [numberTrack(), audio("A", ["one.mp3", "two.mp3"])];
		const work = computeDecodeWorkList(tracks, new Set(), new Set());
		expect(work).toEqual(["one.mp3", "two.mp3"]);
	});

	test("skips srcs already decoded", () => {
		const tracks: Track[] = [audio("A", ["one.mp3", "two.mp3"])];
		const work = computeDecodeWorkList(tracks, new Set(["one.mp3"]), new Set());
		expect(work).toEqual(["two.mp3"]);
	});

	test("skips srcs already in-flight", () => {
		const tracks: Track[] = [audio("A", ["one.mp3", "two.mp3"])];
		const work = computeDecodeWorkList(tracks, new Set(), new Set(["two.mp3"]));
		expect(work).toEqual(["one.mp3"]);
	});

	test("dedupes duplicate srcs across clips and tracks", () => {
		const tracks: Track[] = [
			audio("A", ["shared.mp3", "shared.mp3"]),
			audio("B", ["shared.mp3", "other.mp3"]),
		];
		const work = computeDecodeWorkList(tracks, new Set(), new Set());
		expect(work).toEqual(["shared.mp3", "other.mp3"]);
	});

	test("ignores number tracks", () => {
		const tracks: Track[] = [numberTrack()];
		expect(computeDecodeWorkList(tracks, new Set(), new Set())).toEqual([]);
	});
});
