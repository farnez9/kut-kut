import type { Scene } from "../scene/scene.ts";
import type { CreateLayerRenderer, LayerRenderer } from "./types.ts";

export type Compositor = {
	readonly host: HTMLElement;
	mount: () => Promise<void>;
	setSize: (width: number, height: number) => void;
	renderFrame: () => void;
	ready: () => Promise<void>;
	composite: (output: HTMLCanvasElement) => void;
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

	const renderFrame = (): void => {
		for (const renderer of renderers) renderer.renderFrame();
	};

	const ready = async (): Promise<void> => {
		await Promise.all(renderers.map((r) => r.ready()));
	};

	const composite = (output: HTMLCanvasElement): void => {
		const ctx = output.getContext("2d");
		if (!ctx) throw new Error("composite: output canvas has no 2d context");
		ctx.clearRect(0, 0, output.width, output.height);
		for (const renderer of renderers) {
			ctx.drawImage(renderer.canvas, 0, 0, output.width, output.height);
		}
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

	return { host, mount, setSize, renderFrame, ready, composite, dispose };
};
