import type { Box } from "../scene/box.ts";
import type { Circle } from "../scene/circle.ts";
import type { Group } from "../scene/group.ts";
import type { Image } from "../scene/image.ts";
import type { Layer } from "../scene/layer.ts";
import type { Line } from "../scene/line.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import type { Rect } from "../scene/rect.ts";
import type { Scene } from "../scene/scene.ts";
import type { Text } from "../scene/text.ts";
import {
	type Transform,
	type Transform2D,
	type Transform3D,
	TransformKind,
} from "../scene/transform.ts";
import { createTimeline } from "../timeline/factories.ts";
import { isAudioTrack, isCaptionTrack, type Timeline, type Track } from "../timeline/types.ts";
import type {
	BoxJSON,
	CircleJSON,
	GroupJSON,
	ImageJSON,
	LayerJSON,
	LineJSON,
	NodeJSON,
	ProjectJSON,
	RectJSON,
	SceneJSON,
	TextJSON,
	TimelineJSON,
	TrackJSON,
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

const serializeRect = (r: Rect): RectJSON => ({
	id: r.id,
	type: NodeType.Rect,
	name: r.name,
	transform: serializeTransform2D(r.transform),
	color: r.color.get(),
});

const serializeBox = (b: Box): BoxJSON => ({
	id: b.id,
	type: NodeType.Box,
	name: b.name,
	transform: serializeTransform3D(b.transform),
	color: b.color.get(),
});

const serializeText = (t: Text): TextJSON => ({
	id: t.id,
	type: NodeType.Text,
	name: t.name,
	transform: serializeTransform(t.transform),
	text: t.text.get(),
	fontSize: t.fontSize.get(),
	fontFamily: t.fontFamily.get(),
	color: t.color.get(),
	align: t.align.get(),
});

const serializeCircle = (c: Circle): CircleJSON => ({
	id: c.id,
	type: NodeType.Circle,
	name: c.name,
	transform: serializeTransform(c.transform),
	radius: c.radius.get(),
	color: c.color.get(),
	stroke: c.stroke.get(),
	strokeWidth: c.strokeWidth.get(),
});

const serializeLine = (l: Line): LineJSON => ({
	id: l.id,
	type: NodeType.Line,
	name: l.name,
	transform: serializeTransform(l.transform),
	points: l.points.get().map((p) => [p[0], p[1], p[2]] as [number, number, number]),
	color: l.color.get(),
	width: l.width.get(),
});

const serializeImage = (i: Image): ImageJSON => ({
	id: i.id,
	type: NodeType.Image,
	name: i.name,
	transform: serializeTransform(i.transform),
	src: i.src.get(),
	width: i.width.get(),
	height: i.height.get(),
});

const serializeGroup = (g: Group): GroupJSON => ({
	id: g.id,
	type: NodeType.Group,
	name: g.name,
	transform: serializeTransform(g.transform),
	children: g.children.map(serializeNode),
});

const serializeNode = (node: Node): NodeJSON => {
	switch (node.type) {
		case NodeType.Group:
			return serializeGroup(node);
		case NodeType.Rect:
			return serializeRect(node);
		case NodeType.Box:
			return serializeBox(node);
		case NodeType.Text:
			return serializeText(node);
		case NodeType.Circle:
			return serializeCircle(node);
		case NodeType.Line:
			return serializeLine(node);
		case NodeType.Image:
			return serializeImage(node);
		default:
			throw new Error(`serializeNode: unexpected node type "${node.type}" under a group/layer`);
	}
};

const serializeLayer = (l: Layer): LayerJSON => {
	if (l.type === NodeType.Layer2D) {
		return {
			id: l.id,
			type: NodeType.Layer2D,
			name: l.name,
			transform: serializeTransform2D(l.transform),
			children: l.children.map(serializeNode),
		};
	}
	return {
		id: l.id,
		type: NodeType.Layer3D,
		name: l.name,
		transform: serializeTransform3D(l.transform),
		children: l.children.map(serializeNode),
	};
};

export const serializeScene = (scene: Scene): SceneJSON => ({
	meta: { ...scene.meta },
	layers: scene.layers.map(serializeLayer),
});

const serializeTrack = (track: Track): TrackJSON => {
	if (isAudioTrack(track)) {
		return {
			id: track.id,
			kind: track.kind,
			gain: track.gain,
			muted: track.muted,
			clips: track.clips.map((clip) => ({
				id: clip.id,
				src: clip.src,
				start: clip.start,
				end: clip.end,
				offset: clip.offset,
				gain: clip.gain,
				muted: clip.muted,
			})),
		};
	}
	if (isCaptionTrack(track)) {
		return {
			id: track.id,
			kind: track.kind,
			clips: track.clips.map((clip) => ({
				id: clip.id,
				start: clip.start,
				end: clip.end,
				text: clip.text,
			})),
		};
	}
	return {
		id: track.id,
		kind: track.kind,
		target: { ...track.target },
		clips: track.clips.map((clip) => ({
			id: clip.id,
			start: clip.start,
			end: clip.end,
			keyframes: clip.keyframes.map((k) => ({ time: k.time, value: k.value, easing: k.easing })),
		})),
	};
};

export const serializeTimeline = (timeline: Timeline): TimelineJSON => ({
	tracks: timeline.tracks.map(serializeTrack),
});

export const serialize = (scene: Scene, timeline: Timeline = createTimeline()): ProjectJSON => ({
	schemaVersion: CURRENT_SCHEMA_VERSION,
	scene: serializeScene(scene),
	timeline: serializeTimeline(timeline),
});
