import {
	array,
	type InferOutput,
	literal,
	minLength,
	number,
	object,
	picklist,
	pipe,
	string,
	tuple,
	union,
} from "valibot";

export const CURRENT_OVERLAY_VERSION = 2 as const;

export const OverrideValueSchema = union([number(), tuple([number(), number(), number()])]);

export const PropertyOverrideSchema = object({
	nodePath: array(string()),
	property: string(),
	value: OverrideValueSchema,
});

export const NodeKindSchema = picklist(["rect", "box", "group"] as const);

export const NodeAdditionSchema = object({
	parentPath: pipe(array(string()), minLength(1)),
	name: pipe(string(), minLength(1)),
	kind: NodeKindSchema,
});

export const NodeDeletionSchema = object({
	path: pipe(array(string()), minLength(1)),
});

export const OverlaySchema = object({
	schemaVersion: literal(CURRENT_OVERLAY_VERSION),
	overrides: array(PropertyOverrideSchema),
	additions: array(NodeAdditionSchema),
	deletions: array(NodeDeletionSchema),
});

export type OverrideValue = InferOutput<typeof OverrideValueSchema>;
export type PropertyOverride = InferOutput<typeof PropertyOverrideSchema>;
export type NodeKind = InferOutput<typeof NodeKindSchema>;
export type NodeAddition = InferOutput<typeof NodeAdditionSchema>;
export type NodeDeletion = InferOutput<typeof NodeDeletionSchema>;
export type OverlayJSON = InferOutput<typeof OverlaySchema>;
export type Overlay = OverlayJSON;
