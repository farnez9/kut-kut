import { describe, expect, it } from "bun:test";
import { sceneHmrPlugin } from "./scene-hmr.ts";

describe("sceneHmrPlugin", () => {
	const plugin = sceneHmrPlugin();
	const transform = plugin.transform as (
		this: unknown,
		code: string,
		id: string,
	) => { code: string; map: null } | null;

	it("appends an HMR accept stub to projects/<name>/scene.ts", () => {
		const result = transform.call(
			null,
			"export default () => null;",
			"/repo/projects/example/scene.ts",
		);
		expect(result).not.toBeNull();
		expect(result?.code).toContain("import.meta.hot.accept");
		expect(result?.code).toContain("kk:scene-hmr");
	});

	it("matches scene.ts even when the id has a query string", () => {
		const result = transform.call(
			null,
			"export default () => null;",
			"/repo/projects/example/scene.ts?t=1234",
		);
		expect(result).not.toBeNull();
	});

	it("skips other files in projects/", () => {
		expect(
			transform.call(null, "export const x = 1;", "/repo/projects/example/timeline.json"),
		).toBeNull();
		expect(
			transform.call(null, "export const x = 1;", "/repo/projects/example/scene.ts.map"),
		).toBeNull();
		expect(
			transform.call(null, "export const x = 1;", "/repo/projects/example/helpers.ts"),
		).toBeNull();
	});

	it("skips scene.ts files outside projects/", () => {
		expect(transform.call(null, "x", "/repo/apps/studio/src/scene.ts")).toBeNull();
	});
});
