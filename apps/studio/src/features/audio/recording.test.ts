import { describe, expect, test } from "bun:test";
import { extensionForMime, makeRecordingFilename, pickRecordingMime } from "./recording.ts";

const ASSET_NAME_RE = /^[A-Za-z0-9._-]+$/;

type MRStub = { isTypeSupported: (mime: string) => boolean };

const withMediaRecorder = (stub: MRStub | undefined, fn: () => void): void => {
	const g = globalThis as unknown as { MediaRecorder?: MRStub };
	const prev = g.MediaRecorder;
	if (stub === undefined) delete g.MediaRecorder;
	else g.MediaRecorder = stub;
	try {
		fn();
	} finally {
		if (prev === undefined) delete g.MediaRecorder;
		else g.MediaRecorder = prev;
	}
};

describe("pickRecordingMime", () => {
	test("returns null when MediaRecorder is absent", () => {
		withMediaRecorder(undefined, () => {
			expect(pickRecordingMime()).toBeNull();
		});
	});

	test("returns first supported mime from preference list", () => {
		withMediaRecorder({ isTypeSupported: (m) => m === "audio/webm;codecs=opus" }, () => {
			expect(pickRecordingMime()).toBe("audio/webm;codecs=opus");
		});
	});

	test("falls back to audio/webm when opus unsupported", () => {
		withMediaRecorder({ isTypeSupported: (m) => m === "audio/webm" }, () => {
			expect(pickRecordingMime()).toBe("audio/webm");
		});
	});

	test("falls back to audio/mp4 when webm unsupported", () => {
		withMediaRecorder({ isTypeSupported: (m) => m === "audio/mp4" }, () => {
			expect(pickRecordingMime()).toBe("audio/mp4");
		});
	});

	test("codec'd mp4 wins over bare mp4 when both are supported", () => {
		withMediaRecorder(
			{ isTypeSupported: (m) => m === "audio/mp4;codecs=mp4a.40.2" || m === "audio/mp4" },
			() => {
				expect(pickRecordingMime()).toBe("audio/mp4;codecs=mp4a.40.2");
			},
		);
	});

	test("returns null when nothing matches", () => {
		withMediaRecorder({ isTypeSupported: () => false }, () => {
			expect(pickRecordingMime()).toBeNull();
		});
	});
});

describe("extensionForMime", () => {
	test("maps audio/webm variants to webm", () => {
		expect(extensionForMime("audio/webm")).toBe("webm");
		expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
		expect(extensionForMime("AUDIO/WEBM")).toBe("webm");
	});

	test("maps audio/mp4 variants to m4a", () => {
		expect(extensionForMime("audio/mp4")).toBe("m4a");
		expect(extensionForMime("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
	});

	test("maps audio/ogg and audio/wav", () => {
		expect(extensionForMime("audio/ogg")).toBe("ogg");
		expect(extensionForMime("audio/wav")).toBe("wav");
	});

	test("returns bin for unknown container", () => {
		expect(extensionForMime("application/octet-stream")).toBe("bin");
	});
});

describe("makeRecordingFilename", () => {
	test("produces voiceover-YYYYMMDD-HHMMSS.<ext>", () => {
		const now = new Date(2026, 3, 21, 9, 5, 7); // 2026-04-21 09:05:07 local
		expect(makeRecordingFilename(now, "webm")).toBe("voiceover-20260421-090507.webm");
	});

	test("zero-pads every field", () => {
		const now = new Date(2026, 0, 2, 3, 4, 5);
		expect(makeRecordingFilename(now, "m4a")).toBe("voiceover-20260102-030405.m4a");
	});

	test("passes the plugin's ASSET_NAME_RE for every mapped extension", () => {
		const now = new Date(2026, 11, 31, 23, 59, 59);
		for (const ext of ["webm", "m4a", "ogg", "wav", "bin"]) {
			expect(makeRecordingFilename(now, ext)).toMatch(ASSET_NAME_RE);
		}
	});
});
