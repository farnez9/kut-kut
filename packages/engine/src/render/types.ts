import type { Layer } from "../scene/layer.ts";
import type { SceneMeta } from "../scene/scene.ts";

export type LayerRenderer = {
	readonly canvas: HTMLCanvasElement;
	mount: (host: HTMLElement) => Promise<void>;
	setSize: (width: number, height: number) => void;
	renderFrame: () => void;
	dispose: () => void;
};

export type CreateLayerRendererOptions = {
	layer: Layer;
	meta: SceneMeta;
};

export type CreateLayerRenderer = (options: CreateLayerRendererOptions) => LayerRenderer;
