import { createEffect, createRoot } from "solid-js";
import {
	BoxGeometry,
	BufferGeometry,
	CircleGeometry,
	Color,
	HemisphereLight,
	LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	PerspectiveCamera,
	PlaneGeometry,
	type Texture,
	TextureLoader,
	Group as ThreeGroup,
	Line as ThreeLine,
	Scene as ThreeScene,
	Vector3,
	WebGLRenderer,
} from "three";
import type { WebGPURenderer } from "three/webgpu";
// troika-three-text ships no type declarations; see ./troika-three-text.d.ts for the shim.
import { Text as TroikaText } from "troika-three-text";
import type { Box } from "../scene/box.ts";
import type { Circle } from "../scene/circle.ts";
import type { Group } from "../scene/group.ts";
import type { Image } from "../scene/image.ts";
import type { Scene3DLayer } from "../scene/layer.ts";
import type { Line } from "../scene/line.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Text } from "../scene/text.ts";
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

const mountText3D = (parent: Object3D, text: Text, markDirty: () => void): void => {
	if (text.transform.kind !== "3d") return;
	const troika = new TroikaText();
	troika.anchorX = "center";
	troika.anchorY = "middle";
	parent.add(troika);
	createEffect(() => {
		troika.text = text.text.get();
		troika.sync(markDirty);
	});
	createEffect(() => {
		troika.fontSize = text.fontSize.get();
		troika.sync(markDirty);
	});
	createEffect(() => {
		const [r, g, b] = text.color.get();
		troika.color = new Color(r, g, b);
		markDirty();
	});
	createEffect(() => {
		troika.textAlign = text.align.get();
		troika.sync(markDirty);
	});
	bindTransform3D(troika, text.transform, markDirty);
};

const mountCircle3D = (parent: Object3D, circle: Circle, markDirty: () => void): void => {
	if (circle.transform.kind !== "3d") return;
	const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true });
	let geometry = new CircleGeometry(circle.radius.get(), 32);
	const mesh = new Mesh(geometry, material);
	parent.add(mesh);
	createEffect(() => {
		const r = circle.radius.get();
		geometry.dispose();
		geometry = new CircleGeometry(r, 32);
		mesh.geometry = geometry;
		markDirty();
	});
	createEffect(() => {
		const [r, g, b] = circle.color.get();
		material.color.setRGB(r, g, b);
		markDirty();
	});
	createEffect(() => {
		material.opacity = circle.transform.opacity.get();
		markDirty();
	});
	bindTransform3D(mesh, circle.transform, markDirty);
};

const mountImage3D = (
	parent: Object3D,
	image: Image,
	markDirty: () => void,
	pending: Set<Promise<unknown>>,
): void => {
	if (image.transform.kind !== "3d") return;
	// Outer group carries transform.scale; inner mesh carries width/height as scale on a unit plane.
	const wrapper = new ThreeGroup();
	parent.add(wrapper);
	const geometry = new PlaneGeometry(1, 1);
	const material = new MeshBasicMaterial({ transparent: true });
	const mesh = new Mesh(geometry, material);
	mesh.visible = false;
	wrapper.add(mesh);
	const loader = new TextureLoader();
	let currentTexture: Texture | null = null;
	createEffect(() => {
		const url = image.src.get();
		mesh.visible = false;
		const load = loader.loadAsync(url).then(
			(texture) => {
				if (image.src.get() !== url) {
					texture.dispose();
					return;
				}
				if (currentTexture) currentTexture.dispose();
				currentTexture = texture;
				material.map = texture;
				material.needsUpdate = true;
				mesh.visible = true;
				markDirty();
			},
			() => {
				mesh.visible = false;
			},
		);
		pending.add(load);
		load.finally(() => pending.delete(load));
	});
	createEffect(() => {
		mesh.scale.set(image.width.get(), image.height.get(), 1);
		markDirty();
	});
	createEffect(() => {
		material.opacity = image.transform.opacity.get();
		markDirty();
	});
	bindTransform3D(wrapper, image.transform, markDirty);
};

const mountLine3D = (parent: Object3D, line: Line, markDirty: () => void): void => {
	if (line.transform.kind !== "3d") return;
	const material = new LineBasicMaterial({ color: 0xffffff, transparent: true });
	const geometry = new BufferGeometry();
	const mesh = new ThreeLine(geometry, material);
	parent.add(mesh);
	createEffect(() => {
		const pts = line.points.get();
		mesh.geometry.setFromPoints(pts.map((p) => new Vector3(p[0], p[1], p[2])));
		markDirty();
	});
	createEffect(() => {
		const [r, g, b] = line.color.get();
		material.color.setRGB(r, g, b);
		markDirty();
	});
	createEffect(() => {
		material.opacity = line.transform.opacity.get();
		markDirty();
	});
	bindTransform3D(mesh, line.transform, markDirty);
};

const mountGroup3D = (
	parent: Object3D,
	group: Group,
	markDirty: () => void,
	pending: Set<Promise<unknown>>,
): void => {
	const threeGroup = new ThreeGroup();
	parent.add(threeGroup);
	if (group.transform.kind === "3d") bindTransform3D(threeGroup, group.transform, markDirty);
	for (const child of group.children) mountNode3D(threeGroup, child, markDirty, pending);
};

const mountNode3D = (
	parent: Object3D,
	node: Node,
	markDirty: () => void,
	pending: Set<Promise<unknown>>,
): void => {
	switch (node.type) {
		case NodeType.Box:
			mountBox(parent, node, markDirty);
			return;
		case NodeType.Text:
			mountText3D(parent, node, markDirty);
			return;
		case NodeType.Circle:
			mountCircle3D(parent, node, markDirty);
			return;
		case NodeType.Line:
			mountLine3D(parent, node, markDirty);
			return;
		case NodeType.Image:
			mountImage3D(parent, node, markDirty, pending);
			return;
		case NodeType.Group:
			mountGroup3D(parent, node, markDirty, pending);
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
	const pending = new Set<Promise<unknown>>();
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
		const dist = meta.height / (2 * Math.tan((fov / 2) * (Math.PI / 180)));
		camera = new PerspectiveCamera(fov, aspect, 0.1, dist * 4);
		camera.position.set(0, 0, dist);
		camera.lookAt(0, 0, 0);

		const layerRoot = new ThreeGroup();
		scene3d.add(layerRoot);

		createRoot((dispose) => {
			disposeRoot = dispose;
			bindTransform3D(layerRoot, layer3d.transform, markDirty);
			for (const child of layer3d.children) mountNode3D(layerRoot, child, markDirty, pending);
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

	const renderFrame = (): void => {
		if (!renderer || !scene3d || !camera) return;
		renderer.render(scene3d, camera);
		dirty = false;
	};

	const ready = async (): Promise<void> => {
		while (pending.size > 0) {
			await Promise.allSettled(Array.from(pending));
		}
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

	return { canvas, mount, setSize, renderFrame, ready, dispose };
};
