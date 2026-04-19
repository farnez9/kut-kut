import { CURRENT_OVERLAY_VERSION } from "./schema.ts";

export const migrateOverlay = (input: unknown): unknown => {
	if (!input || typeof input !== "object") return input;
	const version = (input as { schemaVersion?: unknown }).schemaVersion;
	if (version === CURRENT_OVERLAY_VERSION) return input;
	if (version === 1) {
		return {
			...(input as object),
			schemaVersion: CURRENT_OVERLAY_VERSION,
			additions: [],
			deletions: [],
		};
	}
	throw new Error(
		`overlay schemaVersion ${String(version)} not supported (current: ${CURRENT_OVERLAY_VERSION})`,
	);
};
