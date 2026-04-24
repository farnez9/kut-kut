import { Application, Assets, Container, Graphics, Text as PixiText, Sprite } from "pixi.js";
import { createEffect, createRoot } from "solid-js";
import type { Circle } from "../scene/circle.ts";
import type { Group } from "../scene/group.ts";
import type { Image } from "../scene/image.ts";
import type { Scene2DLayer } from "../scene/layer.ts";
import type { Line } from "../scene/line.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Rect } from "../scene/rect.ts";
import type { Text } from "../scene/text.ts";
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

const mountText = (parent: Container, text: Text): void => {
	if (text.transform.kind !== "2d") return;
	const pixi = new PixiText({
		text: text.text.get(),
		// padding guards against glyphs (subscripts, accents) that extend past the font bbox.
		style: { padding: 8 },
	});
	pixi.anchor.set(0.5, 0.5);
	parent.addChild(pixi);
	createEffect(() => {
		pixi.text = text.text.get();
	});
	createEffect(() => {
		const [r, g, b] = text.color.get();
		pixi.style.fill = rgbToHex([r, g, b]);
	});
	createEffect(() => {
		pixi.style.fontSize = text.fontSize.get();
	});
	createEffect(() => {
		pixi.style.fontFamily = text.fontFamily.get();
	});
	createEffect(() => {
		pixi.style.align = text.align.get();
	});
	bindTransform2D(pixi, text.transform);
};

const mountCircle = (parent: Container, circle: Circle): void => {
	if (circle.transform.kind !== "2d") return;
	const g = new Graphics();
	parent.addChild(g);
	createEffect(() => {
		const r = circle.radius.get();
		const stroke = circle.stroke.get();
		const strokeWidth = circle.strokeWidth.get();
		g.clear();
		g.circle(0, 0, r);
		g.fill({ color: rgbToHex(circle.color.get()), alpha: 1 });
		if (stroke && strokeWidth > 0) {
			g.stroke({ color: rgbToHex(stroke), width: strokeWidth, alpha: 1 });
		}
	});
	bindTransform2D(g, circle.transform);
};

const mountLine = (parent: Container, line: Line): void => {
	if (line.transform.kind !== "2d") return;
	const g = new Graphics();
	parent.addChild(g);
	createEffect(() => {
		const points = line.points.get();
		const width = line.width.get();
		g.clear();
		if (points.length < 2) return;
		const first = points[0];
		if (!first) return;
		g.moveTo(first[0], first[1]);
		for (let i = 1; i < points.length; i++) {
			const p = points[i];
			if (!p) continue;
			g.lineTo(p[0], p[1]);
		}
		g.stroke({ color: rgbToHex(line.color.get()), width, alpha: 1 });
	});
	bindTransform2D(g, line.transform);
};

const mountImage = (parent: Container, image: Image, pending: Set<Promise<unknown>>): void => {
	if (image.transform.kind !== "2d") return;
	const sprite = new Sprite();
	sprite.anchor.set(0.5, 0.5);
	sprite.visible = false;
	parent.addChild(sprite);
	createEffect(() => {
		const url = image.src.get();
		sprite.visible = false;
		const load = Assets.load(url).then(
			(texture) => {
				if (image.src.get() !== url) return;
				sprite.texture = texture;
				// Pixi's width/height setters derive from the texture frame, so reapply
				// the authored size after a new texture lands or a swap shows the
				// new texture at its natural pixel size for one frame.
				sprite.width = image.width.get();
				sprite.height = image.height.get();
				sprite.visible = true;
			},
			() => {
				sprite.visible = false;
			},
		);
		pending.add(load);
		load.finally(() => pending.delete(load));
	});
	createEffect(() => {
		sprite.width = image.width.get();
	});
	createEffect(() => {
		sprite.height = image.height.get();
	});
	bindTransform2D(sprite, image.transform);
};

const mountGroup = (parent: Container, group: Group, pending: Set<Promise<unknown>>): void => {
	const container = new Container();
	parent.addChild(container);
	if (group.transform.kind === "2d") bindTransform2D(container, group.transform);
	for (const child of group.children) mountNode(container, child, pending);
};

const mountNode = (parent: Container, node: Node, pending: Set<Promise<unknown>>): void => {
	switch (node.type) {
		case NodeType.Rect:
			mountRect(parent, node);
			return;
		case NodeType.Text:
			mountText(parent, node);
			return;
		case NodeType.Circle:
			mountCircle(parent, node);
			return;
		case NodeType.Line:
			mountLine(parent, node);
			return;
		case NodeType.Image:
			mountImage(parent, node, pending);
			return;
		case NodeType.Group:
			mountGroup(parent, node, pending);
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
	const pending = new Set<Promise<unknown>>();
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
			for (const child of layer2d.children) mountNode(pixiApp.stage, child, pending);
		});
	};

	const setSize = (width: number, height: number): void => {
		if (app) app.renderer.resize(width, height);
	};

	const renderFrame = (): void => {
		if (app) app.renderer.render(app.stage);
	};

	const ready = async (): Promise<void> => {
		while (pending.size > 0) {
			await Promise.allSettled(Array.from(pending));
		}
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

	return { canvas, mount, setSize, renderFrame, ready, dispose };
};
