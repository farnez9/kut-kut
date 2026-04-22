import { describe, expect, test } from "bun:test";
import { extensionForMime, makeTtsFilename } from "./filename.ts";

const ASSET_NAME_RE = /^[A-Za-z0-9._-]+$/;

describe("makeTtsFilename", () => {
	test("produces tts-<provider>-YYYYMMDD-HHMMSS.<ext>", () => {
		const now = new Date(2026, 3, 21, 9, 5, 7);
		expect(makeTtsFilename(now, "elevenlabs", "mp3")).toBe("tts-elevenlabs-20260421-090507.mp3");
	});

	test("strips non-alphanumerics from the provider segment", () => {
		const now = new Date(2026, 0, 2, 3, 4, 5);
		expect(makeTtsFilename(now, "Web Speech!", "webm")).toBe("tts-webspeech-20260102-030405.webm");
	});

	test("falls back to 'tts' when provider collapses to empty", () => {
		const now = new Date(2026, 0, 2, 3, 4, 5);
		expect(makeTtsFilename(now, "!!!", "mp3")).toBe("tts-tts-20260102-030405.mp3");
	});

	test("passes the plugin's ASSET_NAME_RE", () => {
		const now = new Date(2026, 11, 31, 23, 59, 59);
		for (const ext of ["mp3", "wav", "ogg", "webm", "m4a", "bin"]) {
			expect(makeTtsFilename(now, "elevenlabs", ext)).toMatch(ASSET_NAME_RE);
		}
	});
});

describe("extensionForMime", () => {
	test("maps common audio mimes", () => {
		expect(extensionForMime("audio/mpeg")).toBe("mp3");
		expect(extensionForMime("audio/mp3")).toBe("mp3");
		expect(extensionForMime("audio/wav")).toBe("wav");
		expect(extensionForMime("audio/ogg")).toBe("ogg");
		expect(extensionForMime("audio/webm")).toBe("webm");
		expect(extensionForMime("audio/mp4")).toBe("m4a");
	});

	test("tolerates parameters and casing", () => {
		expect(extensionForMime("Audio/MPEG; charset=binary")).toBe("mp3");
		expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
	});

	test("returns bin for unknown mime", () => {
		expect(extensionForMime("application/octet-stream")).toBe("bin");
		expect(extensionForMime("")).toBe("bin");
	});
});
