import { array, type InferOutput, literal, number, object, string, tuple, union } from "valibot";

export const CURRENT_OVERLAY_VERSION = 1 as const;

export const OverrideValueSchema = union([number(), tuple([number(), number(), number()])]);

export const PropertyOverrideSchema = object({
	nodePath: array(string()),
	property: string(),
	value: OverrideValueSchema,
});

export const OverlaySchema = object({
	schemaVersion: literal(CURRENT_OVERLAY_VERSION),
	overrides: array(PropertyOverrideSchema),
});

export type OverrideValue = InferOutput<typeof OverrideValueSchema>;
export type PropertyOverride = InferOutput<typeof PropertyOverrideSchema>;
export type OverlayJSON = InferOutput<typeof OverlaySchema>;
export type Overlay = OverlayJSON;
