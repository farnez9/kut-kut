import { describe, expect, test } from "bun:test";
import { parseSRT, parseVTT, serializeSRT, serializeVTT } from "../../src/captions/parse.ts";

describe("parseSRT", () => {
	test("parses a single cue with index, timestamps, and multi-line text", () => {
		const input = `1
00:00:01,000 --> 00:00:02,500
Hello world
second line
`;
		const clips = parseSRT(input);
		expect(clips).toHaveLength(1);
		const clip = clips[0];
		if (!clip) throw new Error("expected clip");
		expect(clip.start).toBeCloseTo(1, 6);
		expect(clip.end).toBeCloseTo(2.5, 6);
		expect(clip.text).toBe("Hello world\nsecond line");
		expect(typeof clip.id).toBe("string");
	});

	test("tolerates CRLF line endings and a leading BOM", () => {
		const input = `﻿1\r\n00:00:00,500 --> 00:00:01,000\r\nhi\r\n\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nbye\r\n`;
		const clips = parseSRT(input);
		expect(clips).toHaveLength(2);
		expect(clips[0]?.text).toBe("hi");
		expect(clips[1]?.text).toBe("bye");
	});

	test("accepts comma or dot in the ms separator", () => {
		const input = `1\n00:00:01.250 --> 00:00:02,750\ntext`;
		const clips = parseSRT(input);
		expect(clips[0]?.start).toBeCloseTo(1.25, 6);
		expect(clips[0]?.end).toBeCloseTo(2.75, 6);
	});

	test("skips blocks with no timestamp", () => {
		const input = `garbage\n\n1\n00:00:01,000 --> 00:00:02,000\ngood`;
		expect(parseSRT(input)).toHaveLength(1);
	});
});

describe("parseVTT", () => {
	test("strips WEBVTT preamble and NOTE blocks", () => {
		const input = `WEBVTT

NOTE this is a note
that spans lines

00:00:01.000 --> 00:00:02.000
first cue

NOTE another

00:00:03.000 --> 00:00:04.000
second cue
`;
		const clips = parseVTT(input);
		expect(clips).toHaveLength(2);
		expect(clips[0]?.text).toBe("first cue");
		expect(clips[1]?.text).toBe("second cue");
	});

	test("ignores cue settings appended after the end timestamp", () => {
		const input = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:middle line:80%\nline with settings`;
		const clips = parseVTT(input);
		expect(clips).toHaveLength(1);
		expect(clips[0]?.start).toBeCloseTo(1, 6);
		expect(clips[0]?.end).toBeCloseTo(2, 6);
		expect(clips[0]?.text).toBe("line with settings");
	});

	test("accepts short timestamps without hours", () => {
		const input = `WEBVTT\n\n01:30.500 --> 01:32.000\nshort`;
		const clips = parseVTT(input);
		expect(clips[0]?.start).toBeCloseTo(90.5, 6);
		expect(clips[0]?.end).toBeCloseTo(92, 6);
	});
});

describe("serializeSRT", () => {
	test("emits indexed blocks sorted by start", () => {
		const out = serializeSRT([
			{ id: "b", start: 2, end: 3, text: "second" },
			{ id: "a", start: 0, end: 1.5, text: "first" },
		]);
		expect(out).toBe(
			`1\n00:00:00,000 --> 00:00:01,500\nfirst\n\n2\n00:00:02,000 --> 00:00:03,000\nsecond\n`,
		);
	});

	test("handles empty input", () => {
		expect(serializeSRT([])).toBe("");
	});
});

describe("serializeVTT", () => {
	test("emits WEBVTT preamble and dot-separated timestamps", () => {
		const out = serializeVTT([{ id: "x", start: 1.25, end: 2.75, text: "hi" }]);
		expect(out).toBe(`WEBVTT\n\n00:00:01.250 --> 00:00:02.750\nhi\n`);
	});
});

describe("roundtrip", () => {
	test("serializeSRT → parseSRT preserves times and text", () => {
		const originals = [
			{ id: "a", start: 0.5, end: 1.25, text: "alpha" },
			{ id: "b", start: 1.5, end: 2, text: "beta\nsecond line" },
		];
		const reparsed = parseSRT(serializeSRT(originals));
		expect(reparsed).toHaveLength(2);
		expect(reparsed[0]?.start).toBeCloseTo(0.5, 6);
		expect(reparsed[0]?.end).toBeCloseTo(1.25, 6);
		expect(reparsed[0]?.text).toBe("alpha");
		expect(reparsed[1]?.text).toBe("beta\nsecond line");
	});

	test("serializeVTT → parseVTT preserves times and text", () => {
		const originals = [{ id: "a", start: 10, end: 11.5, text: "line one\nline two" }];
		const reparsed = parseVTT(serializeVTT(originals));
		expect(reparsed).toHaveLength(1);
		expect(reparsed[0]?.start).toBeCloseTo(10, 6);
		expect(reparsed[0]?.end).toBeCloseTo(11.5, 6);
		expect(reparsed[0]?.text).toBe("line one\nline two");
	});
});
