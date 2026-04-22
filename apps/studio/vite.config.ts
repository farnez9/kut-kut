import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { projectFsPlugin } from "./vite/project-fs.ts";

const studioRoot = path.dirname(fileURLToPath(import.meta.url));
const enginePkg = path.resolve(studioRoot, "../../packages/engine");

export default defineConfig({
	resolve: {
		alias: {
			"@kut-kut/engine": path.join(enginePkg, "src/index.ts"),
		},
	},
	assetsInclude: [
		"**/*.mp3",
		"**/*.wav",
		"**/*.ogg",
		"**/*.oga",
		"**/*.opus",
		"**/*.m4a",
		"**/*.aac",
		"**/*.flac",
		"**/*.webm",
	],
	optimizeDeps: {
		exclude: ["kokoro-js", "@huggingface/transformers"],
	},
	plugins: [solid(), projectFsPlugin()],
});
