import type { Group } from "../scene/group.ts";
import type { Layer } from "../scene/layer.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Scene } from "../scene/scene.ts";
import {
	type Transform,
	type Transform2D,
	type Transform3D,
	TransformKind,
} from "../scene/transform.ts";
import type {
	GroupJSON,
	LayerJSON,
	ProjectJSON,
	SceneJSON,
	Transform2DJSON,
	Transform3DJSON,
	TransformJSON,
} from "./schema.ts";
import { CURRENT_SCHEMA_VERSION } from "./schema.ts";

const serializeTransform2D = (t: Transform2D): Transform2DJSON => ({
	kind: TransformKind.TwoD,
	x: t.x.get(),
	y: t.y.get(),
	rotation: t.rotation.get(),
	scaleX: t.scaleX.get(),
	scaleY: t.scaleY.get(),
	opacity: t.opacity.get(),
});

const serializeTransform3D = (t: Transform3D): Transform3DJSON => ({
	kind: TransformKind.ThreeD,
	position: t.position.get(),
	rotation: t.rotation.get(),
	scale: t.scale.get(),
	opacity: t.opacity.get(),
});

const serializeTransform = (t: Transform): TransformJSON =>
	t.kind === TransformKind.TwoD ? serializeTransform2D(t) : serializeTransform3D(t);

const serializeGroup = (g: Group): GroupJSON => ({
	id: g.id,
	type: NodeType.Group,
	name: g.name,
	transform: serializeTransform(g.transform),
	children: g.children.map(serializeGroup),
});

const serializeLayer = (l: Layer): LayerJSON => {
	if (l.type === NodeType.Layer2D) {
		return {
			id: l.id,
			type: NodeType.Layer2D,
			name: l.name,
			transform: serializeTransform2D(l.transform),
			children: l.children.map(serializeGroup),
		};
	}
	return {
		id: l.id,
		type: NodeType.Layer3D,
		name: l.name,
		transform: serializeTransform3D(l.transform),
		children: l.children.map(serializeGroup),
	};
};

export const serializeScene = (scene: Scene): SceneJSON => ({
	meta: { ...scene.meta },
	layers: scene.layers.map(serializeLayer),
});

export const serialize = (scene: Scene): ProjectJSON => ({
	schemaVersion: CURRENT_SCHEMA_VERSION,
	scene: serializeScene(scene),
	timeline: null,
});
