import { Application, Container, Graphics } from "pixi.js";
import { createEffect, createRoot } from "solid-js";
import type { Group } from "../scene/group.ts";
import type { Scene2DLayer } from "../scene/layer.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Rect } from "../scene/rect.ts";
import type { Transform2D, Vec3 } from "../scene/transform.ts";
import type { CreateLayerRendererOptions, LayerRenderer } from "./types.ts";

const rgbToHex = (rgb: Vec3): number => {
	const clamp = (n: number): number => Math.max(0, Math.min(1, n));
	const r = Math.round(clamp(rgb[0]) * 255);
	const g = Math.round(clamp(rgb[1]) * 255);
	const b = Math.round(clamp(rgb[2]) * 255);
	return (r << 16) | (g << 8) | b;
};

const bindTransform2D = (target: Container, tx: Transform2D): void => {
	createEffect(() => {
		target.position.set(tx.x.get(), tx.y.get());
	});
	createEffect(() => {
		target.rotation = tx.rotation.get();
	});
	createEffect(() => {
		target.scale.set(tx.scaleX.get(), tx.scaleY.get());
	});
	createEffect(() => {
		target.alpha = tx.opacity.get();
	});
};

const mountRect = (parent: Container, rect: Rect): void => {
	const g = new Graphics();
	parent.addChild(g);
	createEffect(() => {
		g.clear();
		g.rect(-0.5, -0.5, 1, 1);
		g.fill({ color: rgbToHex(rect.color.get()), alpha: 1 });
	});
	bindTransform2D(g, rect.transform);
};

const mountGroup = (parent: Container, group: Group): void => {
	const container = new Container();
	parent.addChild(container);
	if (group.transform.kind === "2d") bindTransform2D(container, group.transform);
	for (const child of group.children) mountNode(container, child);
};

const mountNode = (parent: Container, node: Node): void => {
	switch (node.type) {
		case NodeType.Rect:
			mountRect(parent, node);
			return;
		case NodeType.Group:
			mountGroup(parent, node);
			return;
		default:
			// Silently skip incompatible content (e.g. Box under a 2D layer); revisit with tighter typing later.
			return;
	}
};

export const createPixiLayerRenderer = (options: CreateLayerRendererOptions): LayerRenderer => {
	const { layer, meta } = options;
	if (layer.type !== NodeType.Layer2D) {
		throw new Error(`createPixiLayerRenderer expects a 2D layer, got "${layer.type}"`);
	}
	const layer2d = layer as Scene2DLayer;
	const canvas = document.createElement("canvas");
	let app: Application | null = null;
	let disposeRoot: (() => void) | null = null;

	const mount = async (_host: HTMLElement): Promise<void> => {
		const pixiApp = new Application();
		await pixiApp.init({
			canvas,
			width: meta.width,
			height: meta.height,
			backgroundAlpha: 0,
			preference: "webgpu",
			resolution: globalThis.devicePixelRatio ?? 1,
			autoDensity: true,
		});
		app = pixiApp;

		createRoot((dispose) => {
			disposeRoot = dispose;
			bindTransform2D(pixiApp.stage, layer2d.transform);
			for (const child of layer2d.children) mountNode(pixiApp.stage, child);
		});
	};

	const setSize = (width: number, height: number): void => {
		if (app) app.renderer.resize(width, height);
	};

	const dispose = (): void => {
		if (disposeRoot) {
			disposeRoot();
			disposeRoot = null;
		}
		if (app) {
			app.destroy({ removeView: false }, { children: true });
			app = null;
		}
	};

	return { canvas, mount, setSize, dispose };
};
