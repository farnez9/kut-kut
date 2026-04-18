import type { Layer } from "./layer.ts";

export type SceneMeta = {
	name: string;
	width: number;
	height: number;
	fps: number;
	duration: number;
};

export type Scene = {
	meta: SceneMeta;
	layers: Layer[];
};

export type CreateSceneOptions = {
	meta?: Partial<SceneMeta>;
	layers?: Layer[];
};

const DEFAULT_META: SceneMeta = {
	name: "Untitled",
	width: 1920,
	height: 1080,
	fps: 30,
	duration: 10,
};

export const createScene = (options: CreateSceneOptions = {}): Scene => ({
	meta: { ...DEFAULT_META, ...options.meta },
	layers: options.layers ?? [],
});
