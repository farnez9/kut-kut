import {
	array,
	boolean,
	type GenericSchema,
	type InferOutput,
	lazy,
	literal,
	nullable,
	number,
	object,
	picklist,
	string,
	tuple,
	union,
	variant,
} from "valibot";
import { NodeType } from "../scene/node-type.ts";
import { TransformKind } from "../scene/transform.ts";
import { EasingName } from "../timeline/easing.ts";
import { TrackKind } from "../timeline/types.ts";

export const CURRENT_SCHEMA_VERSION = 5 as const;

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

export const RectSchema = object({
	id: string(),
	type: literal(NodeType.Rect),
	name: string(),
	transform: Transform2DSchema,
	color: Vec3Schema,
});

export const BoxSchema = object({
	id: string(),
	type: literal(NodeType.Box),
	name: string(),
	transform: Transform3DSchema,
	color: Vec3Schema,
});

export const TextAlignSchema = picklist(["left", "center", "right"] as const);

export const TextSchema = object({
	id: string(),
	type: literal(NodeType.Text),
	name: string(),
	transform: TransformSchema,
	text: string(),
	fontSize: number(),
	fontFamily: string(),
	color: Vec3Schema,
	align: TextAlignSchema,
});

export const CircleSchema = object({
	id: string(),
	type: literal(NodeType.Circle),
	name: string(),
	transform: TransformSchema,
	radius: number(),
	color: Vec3Schema,
	stroke: nullable(Vec3Schema),
	strokeWidth: number(),
});

export const LineSchema = object({
	id: string(),
	type: literal(NodeType.Line),
	name: string(),
	transform: TransformSchema,
	points: array(Vec3Schema),
	color: Vec3Schema,
	width: number(),
});

export const ImageSchema = object({
	id: string(),
	type: literal(NodeType.Image),
	name: string(),
	transform: TransformSchema,
	src: string(),
	width: number(),
	height: number(),
});

export type RectJSON = InferOutput<typeof RectSchema>;
export type BoxJSON = InferOutput<typeof BoxSchema>;
export type TextJSON = InferOutput<typeof TextSchema>;
export type CircleJSON = InferOutput<typeof CircleSchema>;
export type LineJSON = InferOutput<typeof LineSchema>;
export type ImageJSON = InferOutput<typeof ImageSchema>;

export type GroupJSON = {
	id: string;
	type: typeof NodeType.Group;
	name: string;
	transform: InferOutput<typeof TransformSchema>;
	children: NodeJSON[];
};

export type NodeJSON =
	| GroupJSON
	| RectJSON
	| BoxJSON
	| TextJSON
	| CircleJSON
	| LineJSON
	| ImageJSON;

const NodeSchemaLazy: GenericSchema<NodeJSON> = lazy(() => NodeSchema);

export const GroupSchema = object({
	id: string(),
	type: literal(NodeType.Group),
	name: string(),
	transform: TransformSchema,
	children: array(NodeSchemaLazy),
});

export const NodeSchema = variant("type", [
	GroupSchema,
	RectSchema,
	BoxSchema,
	TextSchema,
	CircleSchema,
	LineSchema,
	ImageSchema,
]);

export const Layer2DSchema = object({
	id: string(),
	type: literal(NodeType.Layer2D),
	name: string(),
	transform: Transform2DSchema,
	children: array(NodeSchemaLazy),
});

export const Layer3DSchema = object({
	id: string(),
	type: literal(NodeType.Layer3D),
	name: string(),
	transform: Transform3DSchema,
	children: array(NodeSchemaLazy),
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

export const TrackTargetByIdSchema = object({
	nodeId: string(),
	property: string(),
});

export const TrackTargetByPathSchema = object({
	nodePath: array(string()),
	property: string(),
});

export const TrackTargetSchema = union([TrackTargetByPathSchema, TrackTargetByIdSchema]);

export const NumberTrackSchema = object({
	id: string(),
	kind: literal(TrackKind.Number),
	target: TrackTargetSchema,
	clips: array(NumberClipSchema),
});

export const AudioClipSchema = object({
	id: string(),
	src: string(),
	start: number(),
	end: number(),
	offset: number(),
	gain: number(),
	muted: boolean(),
});

export const AudioTrackSchema = object({
	id: string(),
	kind: literal(TrackKind.Audio),
	clips: array(AudioClipSchema),
	gain: number(),
	muted: boolean(),
});

export const CaptionClipSchema = object({
	id: string(),
	start: number(),
	end: number(),
	text: string(),
});

export const CaptionTrackSchema = object({
	id: string(),
	kind: literal(TrackKind.Caption),
	clips: array(CaptionClipSchema),
});

export const TrackSchema = variant("kind", [
	NumberTrackSchema,
	AudioTrackSchema,
	CaptionTrackSchema,
]);

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
export type AudioClipJSON = InferOutput<typeof AudioClipSchema>;
export type AudioTrackJSON = InferOutput<typeof AudioTrackSchema>;
export type CaptionClipJSON = InferOutput<typeof CaptionClipSchema>;
export type CaptionTrackJSON = InferOutput<typeof CaptionTrackSchema>;
export type TrackJSON = InferOutput<typeof TrackSchema>;
export type TrackTargetByIdJSON = InferOutput<typeof TrackTargetByIdSchema>;
export type TrackTargetByPathJSON = InferOutput<typeof TrackTargetByPathSchema>;
export type TrackTargetJSON = InferOutput<typeof TrackTargetSchema>;
export type TimelineJSON = InferOutput<typeof TimelineSchema>;
export type ProjectJSON = InferOutput<typeof ProjectSchema>;
