import {
	array,
	type GenericSchema,
	type InferOutput,
	lazy,
	literal,
	null_,
	number,
	object,
	string,
	tuple,
	variant,
} from "valibot";
import { NodeType } from "../scene/node-type.ts";
import { TransformKind } from "../scene/transform.ts";

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

export const ProjectSchema = object({
	schemaVersion: literal(CURRENT_SCHEMA_VERSION),
	scene: SceneSchema,
	timeline: null_(),
});

export type Transform2DJSON = InferOutput<typeof Transform2DSchema>;
export type Transform3DJSON = InferOutput<typeof Transform3DSchema>;
export type TransformJSON = InferOutput<typeof TransformSchema>;
export type Layer2DJSON = InferOutput<typeof Layer2DSchema>;
export type Layer3DJSON = InferOutput<typeof Layer3DSchema>;
export type LayerJSON = InferOutput<typeof LayerSchema>;
export type SceneMetaJSON = InferOutput<typeof SceneMetaSchema>;
export type SceneJSON = InferOutput<typeof SceneSchema>;
export type ProjectJSON = InferOutput<typeof ProjectSchema>;
