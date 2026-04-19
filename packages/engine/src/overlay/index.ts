export { applyOverlay } from "./apply.ts";
export { migrateOverlay } from "./migrations.ts";
export { applyNodeOps } from "./node-ops.ts";
export { deserializeOverlay, emptyOverlay, parseOverlay } from "./parse.ts";
export {
	CURRENT_OVERLAY_VERSION,
	type NodeAddition,
	NodeAdditionSchema,
	type NodeDeletion,
	NodeDeletionSchema,
	type NodeKind,
	NodeKindSchema,
	type Overlay,
	type OverlayJSON,
	OverlaySchema,
	type OverrideValue,
	OverrideValueSchema,
	type PropertyOverride,
	PropertyOverrideSchema,
} from "./schema.ts";
