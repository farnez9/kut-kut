import { describe, expect, test } from "bun:test";
import { makeExportFilename } from "./filename.ts";

describe("makeExportFilename", () => {
	test("pads date and time to zero-padded YYYYMMDD-HHmm", () => {
		const now = new Date(2026, 0, 5, 7, 9);
		expect(makeExportFilename(now, "example")).toBe("example-20260105-0709.mp4");
	});

	test("sanitises project name to kebab-lower", () => {
		const now = new Date(2026, 3, 22, 14, 30);
		expect(makeExportFilename(now, "My Cool Project!")).toBe("my-cool-project-20260422-1430.mp4");
	});

	test("falls back to 'export' when name has no safe chars", () => {
		const now = new Date(2026, 3, 22, 0, 0);
		expect(makeExportFilename(now, "***")).toBe("export-20260422-0000.mp4");
	});
});
