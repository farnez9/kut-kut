import { describe, expect, test } from "bun:test";
import { CURRENT_OVERLAY_VERSION, parseOverlay } from "../../src/overlay/index.ts";

describe("parseOverlay", () => {
	test("accepts an empty-overrides document", () => {
		const parsed = parseOverlay({ schemaVersion: CURRENT_OVERLAY_VERSION, overrides: [] });
		expect(parsed).toEqual({ schemaVersion: 1, overrides: [] });
	});

	test("accepts scalar and vec3 override values", () => {
		const parsed = parseOverlay({
			schemaVersion: CURRENT_OVERLAY_VERSION,
			overrides: [
				{ nodePath: ["2D", "Hero"], property: "transform.x", value: 123 },
				{ nodePath: ["3D", "Cube"], property: "transform.position", value: [1, 2, 3] },
			],
		});
		expect(parsed.overrides).toHaveLength(2);
		expect(parsed.overrides[0]?.value).toBe(123);
		expect(parsed.overrides[1]?.value).toEqual([1, 2, 3]);
	});

	test("rejects an unknown schema version", () => {
		expect(() => parseOverlay({ schemaVersion: 2, overrides: [] })).toThrow();
	});

	test("rejects a value that is neither number nor triple", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [{ nodePath: ["2D", "Hero"], property: "transform.x", value: "100" }],
			}),
		).toThrow();
	});

	test("rejects a 2-tuple instead of a 3-tuple", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [{ nodePath: ["3D", "Cube"], property: "transform.position", value: [1, 2] }],
			}),
		).toThrow();
	});

	test("rejects missing nodePath", () => {
		expect(() =>
			parseOverlay({
				schemaVersion: CURRENT_OVERLAY_VERSION,
				overrides: [{ property: "transform.x", value: 1 }],
			}),
		).toThrow();
	});
});
