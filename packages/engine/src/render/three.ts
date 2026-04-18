import { createEffect, createRoot } from "solid-js";
import {
	BoxGeometry,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	PerspectiveCamera,
	Group as ThreeGroup,
	Scene as ThreeScene,
	WebGLRenderer,
} from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { Box } from "../scene/box.ts";
import type { Group } from "../scene/group.ts";
import type { Scene3DLayer } from "../scene/layer.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Transform3D, Vec3 } from "../scene/transform.ts";
import type { CreateLayerRendererOptions, LayerRenderer } from "./types.ts";

type ThreeRenderer = WebGLRenderer | WebGPURenderer;

const bindTransform3D = (target: Object3D, tx: Transform3D, markDirty: () => void): void => {
	createEffect(() => {
		const [x, y, z] = tx.position.get();
		target.position.set(x, y, z);
		markDirty();
	});
	createEffect(() => {
		const [x, y, z] = tx.rotation.get();
		target.rotation.set(x, y, z);
		markDirty();
	});
	createEffect(() => {
		const [x, y, z] = tx.scale.get();
		target.scale.set(x, y, z);
		markDirty();
	});
};

const mountBox = (parent: Object3D, box: Box, markDirty: () => void): void => {
	const geometry = new BoxGeometry(1, 1, 1);
	const material = new MeshStandardMaterial({ color: 0xffffff });
	const mesh = new Mesh(geometry, material);
	parent.add(mesh);
	createEffect(() => {
		const [r, g, b] = box.color.get() as Vec3;
		material.color.setRGB(r, g, b);
		markDirty();
	});
	createEffect(() => {
		mesh.material.opacity = box.transform.opacity.get();
		mesh.material.transparent = mesh.material.opacity < 1;
		markDirty();
	});
	bindTransform3D(mesh, box.transform, markDirty);
};

const mountGroup3D = (parent: Object3D, group: Group, markDirty: () => void): void => {
	const threeGroup = new ThreeGroup();
	parent.add(threeGroup);
	if (group.transform.kind === "3d") bindTransform3D(threeGroup, group.transform, markDirty);
	for (const child of group.children) mountNode3D(threeGroup, child, markDirty);
};

const mountNode3D = (parent: Object3D, node: Node, markDirty: () => void): void => {
	switch (node.type) {
		case NodeType.Box:
			mountBox(parent, node, markDirty);
			return;
		case NodeType.Group:
			mountGroup3D(parent, node, markDirty);
			return;
		default:
			return;
	}
};

export const createThreeLayerRenderer = (options: CreateLayerRendererOptions): LayerRenderer => {
	const { layer, meta } = options;
	if (layer.type !== NodeType.Layer3D) {
		throw new Error(`createThreeLayerRenderer expects a 3D layer, got "${layer.type}"`);
	}
	const layer3d = layer as Scene3DLayer;
	const canvas = document.createElement("canvas");
	let renderer: ThreeRenderer | null = null;
	let scene3d: ThreeScene | null = null;
	let camera: PerspectiveCamera | null = null;
	let disposeRoot: (() => void) | null = null;
	let rafId: number | null = null;
	let dirty = true;

	const markDirty = (): void => {
		dirty = true;
	};

	const frame = (): void => {
		rafId = null;
		if (!renderer || !scene3d || !camera) return;
		if (dirty) {
			dirty = false;
			renderer.render(scene3d, camera);
		}
		rafId = requestAnimationFrame(frame);
	};

	const mount = async (_host: HTMLElement): Promise<void> => {
		if (typeof navigator !== "undefined" && navigator.gpu) {
			try {
				const { WebGPURenderer } = await import("three/webgpu");
				const r = new WebGPURenderer({ canvas, antialias: true });
				await r.init();
				renderer = r;
			} catch {
				renderer = new WebGLRenderer({ canvas, antialias: true });
			}
		} else {
			renderer = new WebGLRenderer({ canvas, antialias: true });
		}
		renderer.setSize(meta.width, meta.height, false);
		renderer.setPixelRatio(globalThis.devicePixelRatio ?? 1);

		scene3d = new ThreeScene();
		scene3d.add(new HemisphereLight(0xffffff, 0x404040, 1.2));

		const fov = 45;
		const aspect = meta.width / meta.height;
		camera = new PerspectiveCamera(fov, aspect, 0.1, 1000);
		const dist = meta.height / (2 * Math.tan((fov / 2) * (Math.PI / 180)));
		camera.position.set(0, 0, dist);
		camera.lookAt(0, 0, 0);

		const layerRoot = new ThreeGroup();
		scene3d.add(layerRoot);

		createRoot((dispose) => {
			disposeRoot = dispose;
			bindTransform3D(layerRoot, layer3d.transform, markDirty);
			for (const child of layer3d.children) mountNode3D(layerRoot, child, markDirty);
		});

		markDirty();
		rafId = requestAnimationFrame(frame);
	};

	const setSize = (width: number, height: number): void => {
		if (renderer) renderer.setSize(width, height, false);
		if (camera) {
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
		markDirty();
	};

	const dispose = (): void => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (disposeRoot) {
			disposeRoot();
			disposeRoot = null;
		}
		if (renderer) {
			renderer.dispose();
			renderer = null;
		}
		scene3d = null;
		camera = null;
	};

	return { canvas, mount, setSize, dispose };
};
