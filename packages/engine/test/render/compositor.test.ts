import { describe, expect, test } from "bun:test";
import { createCompositor } from "../../src/render/index.ts";
import type { CreateLayerRendererOptions, LayerRenderer } from "../../src/render/types.ts";
import { createLayer2D, createLayer3D, createScene, NodeType } from "../../src/scene/index.ts";

type FakeCanvas = HTMLCanvasElement & { parentElement: HTMLElement | null };

type FakeHost = {
	__children: FakeCanvas[];
	appendChild: (node: Node) => Node;
	removeChild: (node: Node) => Node;
};

const makeHost = (): HTMLElement => {
	const children: FakeCanvas[] = [];
	const host: FakeHost = {
		__children: children,
		appendChild: (node) => {
			const canvas = node as FakeCanvas;
			canvas.parentElement = host as unknown as HTMLElement;
			children.push(canvas);
			return node;
		},
		removeChild: (node) => {
			const canvas = node as FakeCanvas;
			const idx = children.indexOf(canvas);
			if (idx >= 0) children.splice(idx, 1);
			canvas.parentElement = null;
			return node;
		},
	};
	return host as unknown as HTMLElement;
};

const getChildren = (host: HTMLElement): FakeCanvas[] => (host as unknown as FakeHost).__children;

const makeCanvas = (id: string): FakeCanvas => {
	const canvas: Partial<FakeCanvas> = {};
	(canvas as unknown as { __id: string }).__id = id;
	canvas.parentElement = null;
	return canvas as FakeCanvas;
};

type Event =
	| { kind: "create"; layer: string }
	| { kind: "mount"; id: string }
	| { kind: "size"; id: string; w: number; h: number }
	| { kind: "dispose"; id: string };

const makeFactory = () => {
	const events: Event[] = [];
	let counter = 0;
	const factory = (opts: CreateLayerRendererOptions): LayerRenderer => {
		const id = `r${counter++}`;
		events.push({ kind: "create", layer: opts.layer.id });
		const canvas = makeCanvas(id);
		return {
			canvas,
			mount: async () => {
				events.push({ kind: "mount", id });
			},
			setSize: (w, h) => {
				events.push({ kind: "size", id, w, h });
			},
			renderFrame: () => {},
			dispose: () => {
				events.push({ kind: "dispose", id });
			},
		};
	};
	return { factory, events };
};

describe("Compositor", () => {
	test("mount creates one renderer per layer in order and appends canvases", async () => {
		const scene = createScene({
			layers: [
				createLayer2D({ id: "l-a", name: "a" }),
				createLayer3D({ id: "l-b", name: "b" }),
				createLayer2D({ id: "l-c", name: "c" }),
			],
		});
		const host = makeHost();
		const { factory, events } = makeFactory();
		const compositor = createCompositor({ host, scene, createLayerRenderer: factory });

		await compositor.mount();

		expect(events).toEqual([
			{ kind: "create", layer: "l-a" },
			{ kind: "mount", id: "r0" },
			{ kind: "create", layer: "l-b" },
			{ kind: "mount", id: "r1" },
			{ kind: "create", layer: "l-c" },
			{ kind: "mount", id: "r2" },
		]);
		expect(getChildren(host)).toHaveLength(3);
		expect((getChildren(host)[0] as unknown as { __id: string }).__id).toBe("r0");
		expect((getChildren(host)[2] as unknown as { __id: string }).__id).toBe("r2");
	});

	test("setSize fans out to every layer renderer", async () => {
		const scene = createScene({
			layers: [createLayer2D({ id: "l-a" }), createLayer3D({ id: "l-b" })],
		});
		const host = makeHost();
		const { factory, events } = makeFactory();
		const compositor = createCompositor({ host, scene, createLayerRenderer: factory });
		await compositor.mount();

		compositor.setSize(640, 480);
		const sizeEvents = events.filter((e) => e.kind === "size");
		expect(sizeEvents).toEqual([
			{ kind: "size", id: "r0", w: 640, h: 480 },
			{ kind: "size", id: "r1", w: 640, h: 480 },
		]);
	});

	test("dispose tears down in reverse order and removes canvases", async () => {
		const scene = createScene({
			layers: [createLayer2D({ id: "l-a" }), createLayer3D({ id: "l-b" })],
		});
		const host = makeHost();
		const { factory, events } = makeFactory();
		const compositor = createCompositor({ host, scene, createLayerRenderer: factory });
		await compositor.mount();

		compositor.dispose();
		const disposeIds = events.filter((e) => e.kind === "dispose").map((e) => e.id);
		expect(disposeIds).toEqual(["r1", "r0"]);
		expect(getChildren(host)).toHaveLength(0);
	});

	test("factory sees the correct layer kind per scene position", async () => {
		const scene = createScene({
			layers: [createLayer2D({ id: "a" }), createLayer3D({ id: "b" })],
		});
		const host = makeHost();
		const seen: Array<{ id: string; type: string }> = [];
		const factory = (opts: CreateLayerRendererOptions): LayerRenderer => {
			seen.push({ id: opts.layer.id, type: opts.layer.type });
			return {
				canvas: makeCanvas("x"),
				mount: async () => {},
				setSize: () => {},
				renderFrame: () => {},
				dispose: () => {},
			};
		};
		const compositor = createCompositor({ host, scene, createLayerRenderer: factory });
		await compositor.mount();
		expect(seen).toEqual([
			{ id: "a", type: NodeType.Layer2D },
			{ id: "b", type: NodeType.Layer3D },
		]);
	});

	test("mount is idempotent (calling twice does not double-mount)", async () => {
		const scene = createScene({ layers: [createLayer2D({ id: "a" })] });
		const host = makeHost();
		const { factory, events } = makeFactory();
		const compositor = createCompositor({ host, scene, createLayerRenderer: factory });
		await compositor.mount();
		await compositor.mount();
		expect(events.filter((e) => e.kind === "mount")).toHaveLength(1);
	});
});
