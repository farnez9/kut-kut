import {
	array,
	type GenericSchema,
	type InferOutput,
	lazy,
	literal,
	number,
	object,
	picklist,
	string,
	tuple,
	variant,
} from "valibot";
import { NodeType } from "../scene/node-type.ts";
import { TransformKind } from "../scene/transform.ts";
import { EasingName } from "../timeline/easing.ts";
import { TrackKind } from "../timeline/types.ts";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const Vec3Schema = tuple([number(), number(), number()]);

export const Transform2DSchema = object({
	kind: literal(TransformKind.TwoD),
	x: number(),
	y: number(),
	rotation: number(),
	scaleX: number(),
	scaleY: number(),
	opacity: number(),
});

export const Transform3DSchema = object({
	kind: literal(TransformKind.ThreeD),
	position: Vec3Schema,
	rotation: Vec3Schema,
	scale: Vec3Schema,
	opacity: number(),
});

export const TransformSchema = variant("kind", [Transform2DSchema, Transform3DSchema]);

export type GroupJSON = {
	id: string;
	type: typeof NodeType.Group;
	name: string;
	transform: InferOutput<typeof TransformSchema>;
	children: GroupJSON[];
};

export const GroupSchema: GenericSchema<GroupJSON> = object({
	id: string(),
	type: literal(NodeType.Group),
	name: string(),
	transform: TransformSchema,
	children: array(lazy(() => GroupSchema)),
});

export const Layer2DSchema = object({
	id: string(),
	type: literal(NodeType.Layer2D),
	name: string(),
	transform: Transform2DSchema,
	children: array(GroupSchema),
});

export const Layer3DSchema = object({
	id: string(),
	type: literal(NodeType.Layer3D),
	name: string(),
	transform: Transform3DSchema,
	children: array(GroupSchema),
});

export const LayerSchema = variant("type", [Layer2DSchema, Layer3DSchema]);

export const SceneMetaSchema = object({
	name: string(),
	width: number(),
	height: number(),
	fps: number(),
	duration: number(),
});

export const SceneSchema = object({
	meta: SceneMetaSchema,
	layers: array(LayerSchema),
});

export const EasingNameSchema = picklist(Object.values(EasingName));

export const NumberKeyframeSchema = object({
	time: number(),
	value: number(),
	easing: EasingNameSchema,
});

export const NumberClipSchema = object({
	id: string(),
	start: number(),
	end: number(),
	keyframes: array(NumberKeyframeSchema),
});

export const TrackTargetSchema = object({
	nodeId: string(),
	property: string(),
});

export const NumberTrackSchema = object({
	id: string(),
	kind: literal(TrackKind.Number),
	target: TrackTargetSchema,
	clips: array(NumberClipSchema),
});

export const TrackSchema = variant("kind", [NumberTrackSchema]);

export const TimelineSchema = object({
	tracks: array(TrackSchema),
});

export const ProjectSchema = object({
	schemaVersion: literal(CURRENT_SCHEMA_VERSION),
	scene: SceneSchema,
	timeline: TimelineSchema,
});

export type Transform2DJSON = InferOutput<typeof Transform2DSchema>;
export type Transform3DJSON = InferOutput<typeof Transform3DSchema>;
export type TransformJSON = InferOutput<typeof TransformSchema>;
export type Layer2DJSON = InferOutput<typeof Layer2DSchema>;
export type Layer3DJSON = InferOutput<typeof Layer3DSchema>;
export type LayerJSON = InferOutput<typeof LayerSchema>;
export type SceneMetaJSON = InferOutput<typeof SceneMetaSchema>;
export type SceneJSON = InferOutput<typeof SceneSchema>;
export type NumberKeyframeJSON = InferOutput<typeof NumberKeyframeSchema>;
export type NumberClipJSON = InferOutput<typeof NumberClipSchema>;
export type NumberTrackJSON = InferOutput<typeof NumberTrackSchema>;
export type TrackJSON = InferOutput<typeof TrackSchema>;
export type TrackTargetJSON = InferOutput<typeof TrackTargetSchema>;
export type TimelineJSON = InferOutput<typeof TimelineSchema>;
export type ProjectJSON = InferOutput<typeof ProjectSchema>;
