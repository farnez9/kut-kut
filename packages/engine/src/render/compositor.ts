import type { Scene } from "../scene/scene.ts";
import type { CreateLayerRenderer, LayerRenderer } from "./types.ts";

export type Compositor = {
	readonly host: HTMLElement;
	mount: () => Promise<void>;
	setSize: (width: number, height: number) => void;
	dispose: () => void;
};

export type CreateCompositorOptions = {
	host: HTMLElement;
	scene: Scene;
	createLayerRenderer: CreateLayerRenderer;
};

export const createCompositor = (options: CreateCompositorOptions): Compositor => {
	const { host, scene, createLayerRenderer } = options;
	const renderers: LayerRenderer[] = [];
	let mounted = false;

	const mount = async (): Promise<void> => {
		if (mounted) return;
		mounted = true;
		for (const layer of scene.layers) {
			const renderer = createLayerRenderer({ layer, meta: scene.meta });
			renderers.push(renderer);
			host.appendChild(renderer.canvas);
			await renderer.mount(host);
		}
	};

	const setSize = (width: number, height: number): void => {
		for (const renderer of renderers) renderer.setSize(width, height);
	};

	const dispose = (): void => {
		while (renderers.length > 0) {
			const renderer = renderers.pop();
			if (!renderer) continue;
			renderer.dispose();
			if (renderer.canvas.parentElement === host) host.removeChild(renderer.canvas);
		}
		mounted = false;
	};

	return { host, mount, setSize, dispose };
};
