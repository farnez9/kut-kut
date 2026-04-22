import { describe, expect, test } from "bun:test";
import { CURRENT_OVERLAY_VERSION, emptyOverlay, parseOverlay } from "../../src/overlay/index.ts";

describe("parseOverlay", () => {
	test("accepts an empty document at the current version", () => {
		const parsed = parseOverlay(emptyOverlay());
		expect(parsed).toEqual({
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [],
			additions: [],
			deletions: [],
		});
	});

	test("accepts a meta override with partial fields", () => {
		const parsed = parseOverlay({
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [],
			additions: [],
			deletions: [],
			meta: { width: 1080, height: 1920 },
		});
		expect(parsed.meta).toEqual({ width: 1080, height: 1920 });
	});

	test("rejects a non-number meta field", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [],
				additions: [],
				deletions: [],
				meta: { width: "1080" },
			}),
		).toThrow();
	});

	test("accepts scalar and vec3 override values", () => {
		const parsed = parseOverlay({
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [
				{ nodePath: ["2D", "Hero"], property: "transform.x", value: 123 },
				{ nodePath: ["3D", "Cube"], property: "transform.position", value: [1, 2, 3] },
			],
			additions: [],
			deletions: [],
		});
		expect(parsed.overrides).toHaveLength(2);
		expect(parsed.overrides[0]?.value).toBe(123);
		expect(parsed.overrides[1]?.value).toEqual([1, 2, 3]);
	});

	test("accepts additions and deletions", () => {
		const parsed = parseOverlay({
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [],
			additions: [{ parentPath: ["2D"], name: "Extra", kind: "rect" }],
			deletions: [{ path: ["2D", "Hero"] }],
		});
		expect(parsed.additions).toHaveLength(1);
		expect(parsed.additions[0]?.kind).toBe("rect");
		expect(parsed.deletions).toHaveLength(1);
		expect(parsed.deletions[0]?.path).toEqual(["2D", "Hero"]);
	});

	test("rejects a future schema version", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: 99,
				overrides: [],
				additions: [],
				deletions: [],
			}),
		).toThrow(/schemaVersion 99 not supported/);
	});

	test("migrates v2 overlays to the current version", () => {
		const parsed = parseOverlay({
			schemaVersion: 2,
			overrides: [],
			additions: [],
			deletions: [],
		});
		expect(parsed.schemaVersion).toBe(CURRENT_OVERLAY_VERSION);
	});

	test("rejects a value that is neither number nor triple", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [{ nodePath: ["2D", "Hero"], property: "transform.x", value: "100" }],
				additions: [],
				deletions: [],
			}),
		).toThrow();
	});

	test("rejects a 2-tuple instead of a 3-tuple", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [{ nodePath: ["3D", "Cube"], property: "transform.position", value: [1, 2] }],
				additions: [],
				deletions: [],
			}),
		).toThrow();
	});

	test("rejects missing nodePath", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [{ property: "transform.x", value: 1 }],
				additions: [],
				deletions: [],
			}),
		).toThrow();
	});

	test("rejects an empty parentPath on addition", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [],
				additions: [{ parentPath: [], name: "Extra", kind: "rect" }],
				deletions: [],
			}),
		).toThrow();
	});

	test("rejects an unknown node kind", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [],
				additions: [{ parentPath: ["2D"], name: "Extra", kind: "circle" }],
				deletions: [],
			}),
		).toThrow();
	});
});

describe("overlay migration (v1 → current)", () => {
	test("fills additions and deletions with empty arrays", () => {
		const parsed = parseOverlay({
			schemaVersion: 1,
			overrides: [{ nodePath: ["2D", "Hero"], property: "transform.x", value: 5 }],
		});
		expect(parsed.schemaVersion).toBe(CURRENT_OVERLAY_VERSION);
		expect(parsed.additions).toEqual([]);
		expect(parsed.deletions).toEqual([]);
		expect(parsed.overrides).toHaveLength(1);
	});

	test("preserves existing overrides through the migration", () => {
		const parsed = parseOverlay({
			schemaVersion: 1,
			overrides: [{ nodePath: ["3D", "Cube"], property: "transform.position", value: [1, 2, 3] }],
		});
		expect(parsed.overrides[0]?.value).toEqual([1, 2, 3]);
	});

	test("v2 → v3 is identity (meta stays absent)", () => {
		const parsed = parseOverlay({
			schemaVersion: 2,
			overrides: [],
			additions: [{ parentPath: ["2D"], name: "A", kind: "rect" as const }],
			deletions: [],
		});
		expect(parsed.schemaVersion).toBe(CURRENT_OVERLAY_VERSION);
		expect(parsed.additions).toHaveLength(1);
		expect(parsed.meta).toBeUndefined();
	});

	test("is a no-op for current-version documents", () => {
		const input = {
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [],
			additions: [{ parentPath: ["2D"], name: "A", kind: "rect" as const }],
			deletions: [],
		};
		const parsed = parseOverlay(input);
		expect(parsed.additions).toHaveLength(1);
	});
});
