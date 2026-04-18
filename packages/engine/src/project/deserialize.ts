import { parse } from "valibot";
import { prop } from "../reactive/property.ts";
import type { Box } from "../scene/box.ts";
import type { Group } from "../scene/group.ts";
import type { Layer, Scene2DLayer, Scene3DLayer } from "../scene/layer.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Rect } from "../scene/rect.ts";
import type { Scene } from "../scene/scene.ts";
import { type Transform2D, type Transform3D, TransformKind } from "../scene/transform.ts";
import { assertSceneStructure } from "../scene/validate.ts";
import type { Timeline } from "../timeline/types.ts";
import { migrate } from "./migrations.ts";
import type {
	BoxJSON,
	GroupJSON,
	LayerJSON,
	NodeJSON,
	RectJSON,
	SceneJSON,
	TimelineJSON,
	Transform2DJSON,
	Transform3DJSON,
} from "./schema.ts";
import { ProjectSchema, TimelineSchema } from "./schema.ts";

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

const rehydrateRect = (r: RectJSON): Rect => ({
	id: r.id,
	type: NodeType.Rect,
	name: r.name,
	transform: rehydrateTransform2D(r.transform),
	color: prop(r.color),
});

const rehydrateBox = (b: BoxJSON): Box => ({
	id: b.id,
	type: NodeType.Box,
	name: b.name,
	transform: rehydrateTransform3D(b.transform),
	color: prop(b.color),
});

const rehydrateGroup = (g: GroupJSON): Group => ({
	id: g.id,
	type: NodeType.Group,
	name: g.name,
	transform:
		g.transform.kind === TransformKind.TwoD
			? rehydrateTransform2D(g.transform)
			: rehydrateTransform3D(g.transform),
	children: g.children.map(rehydrateNode),
});

const rehydrateNode = (node: NodeJSON): Node => {
	switch (node.type) {
		case NodeType.Group:
			return rehydrateGroup(node);
		case NodeType.Rect:
			return rehydrateRect(node);
		case NodeType.Box:
			return rehydrateBox(node);
	}
};

const rehydrateLayer = (l: LayerJSON): Layer => {
	if (l.type === NodeType.Layer2D) {
		const layer: Scene2DLayer = {
			id: l.id,
			type: NodeType.Layer2D,
			name: l.name,
			transform: rehydrateTransform2D(l.transform),
			children: l.children.map(rehydrateNode),
		};
		return layer;
	}
	const layer: Scene3DLayer = {
		id: l.id,
		type: NodeType.Layer3D,
		name: l.name,
		transform: rehydrateTransform3D(l.transform),
		children: l.children.map(rehydrateNode),
	};
	return layer;
};

const rehydrateScene = (s: SceneJSON): Scene => ({
	meta: { ...s.meta },
	layers: s.layers.map(rehydrateLayer),
});

const rehydrateTimeline = (t: TimelineJSON): Timeline => ({
	tracks: t.tracks.map((track) => ({
		id: track.id,
		kind: track.kind,
		target: { ...track.target },
		clips: track.clips.map((clip) => ({
			id: clip.id,
			start: clip.start,
			end: clip.end,
			keyframes: clip.keyframes.map((k) => ({ time: k.time, value: k.value, easing: k.easing })),
		})),
	})),
});

export type Project = {
	scene: Scene;
	timeline: Timeline;
};

export const deserialize = (input: unknown): Project => {
	const migrated = migrate(input);
	const project = parse(ProjectSchema, migrated);
	const scene = rehydrateScene(project.scene);
	assertSceneStructure(scene);
	return {
		scene,
		timeline: rehydrateTimeline(project.timeline),
	};
};

export const parseTimeline = (input: unknown): TimelineJSON => parse(TimelineSchema, input);

export const deserializeTimeline = (input: unknown): Timeline =>
	rehydrateTimeline(parseTimeline(input));
