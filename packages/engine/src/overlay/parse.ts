import { parse } from "valibot";
import { migrateOverlay } from "./migrations.ts";
import {
	CURRENT_OVERLAY_VERSION,
	type Overlay,
	type OverlayJSON,
	OverlaySchema,
} from "./schema.ts";

export const parseOverlay = (input: unknown): OverlayJSON =>
	parse(OverlaySchema, migrateOverlay(input));

export const deserializeOverlay = (input: unknown): Overlay => parseOverlay(input);

export const emptyOverlay = (): Overlay => ({
	schemaVersion: CURRENT_OVERLAY_VERSION,
	overrides: [],
	additions: [],
	deletions: [],
});
