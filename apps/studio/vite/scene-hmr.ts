import type { Plugin } from "vite";

const SCENE_RE = /\/projects\/[^/]+\/scene\.ts(?:\?.*)?$/;

export const sceneHmrPlugin = (): Plugin => ({
	name: "kk:scene-hmr",
	transform(code, id) {
		if (!SCENE_RE.test(id)) return null;
		const stub = `
if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (typeof window !== "undefined" && next) {
      window.dispatchEvent(new CustomEvent("kk:scene-hmr", { detail: { url: import.meta.url, module: next } }));
    }
  });
}
`;
		return { code: code + stub, map: null };
	},
});
