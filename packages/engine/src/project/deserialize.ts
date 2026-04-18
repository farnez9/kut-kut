import { parse } from "valibot";
import { prop } from "../reactive/property.ts";
import type { Group } from "../scene/group.ts";
import type { Layer, Scene2DLayer, Scene3DLayer } from "../scene/layer.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Scene } from "../scene/scene.ts";
import { type Transform2D, type Transform3D, TransformKind } from "../scene/transform.ts";
import { migrate } from "./migrations.ts";
import type {
	GroupJSON,
	LayerJSON,
	SceneJSON,
	Transform2DJSON,
	Transform3DJSON,
} from "./schema.ts";
import { ProjectSchema } from "./schema.ts";

const rehydrateTransform2D = (t: Transform2DJSON): Transform2D => ({
	kind: TransformKind.TwoD,
	x: prop(t.x),
	y: prop(t.y),
	rotation: prop(t.rotation),
	scaleX: prop(t.scaleX),
	scaleY: prop(t.scaleY),
	opacity: prop(t.opacity),
});

const rehydrateTransform3D = (t: Transform3DJSON): Transform3D => ({
	kind: TransformKind.ThreeD,
	position: prop(t.position),
	rotation: prop(t.rotation),
	scale: prop(t.scale),
	opacity: prop(t.opacity),
});

const rehydrateGroup = (g: GroupJSON): Group => ({
	id: g.id,
	type: NodeType.Group,
	name: g.name,
	transform:
		g.transform.kind === TransformKind.TwoD
			? rehydrateTransform2D(g.transform)
			: rehydrateTransform3D(g.transform),
	children: g.children.map(rehydrateGroup),
});

const rehydrateLayer = (l: LayerJSON): Layer => {
	if (l.type === NodeType.Layer2D) {
		const layer: Scene2DLayer = {
			id: l.id,
			type: NodeType.Layer2D,
			name: l.name,
			transform: rehydrateTransform2D(l.transform),
			children: l.children.map(rehydrateGroup),
		};
		return layer;
	}
	const layer: Scene3DLayer = {
		id: l.id,
		type: NodeType.Layer3D,
		name: l.name,
		transform: rehydrateTransform3D(l.transform),
		children: l.children.map(rehydrateGroup),
	};
	return layer;
};

const rehydrateScene = (s: SceneJSON): Scene => ({
	meta: { ...s.meta },
	layers: s.layers.map(rehydrateLayer),
});

export const deserialize = (input: unknown): Scene => {
	const migrated = migrate(input);
	const project = parse(ProjectSchema, migrated);
	return rehydrateScene(project.scene);
};
