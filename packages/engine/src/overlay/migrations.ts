import { CURRENT_OVERLAY_VERSION } from "./schema.ts";

export const migrateOverlay = (input: unknown): unknown => {
	if (!input || typeof input !== "object") return input;
	let record = input as Record<string, unknown>;
	let version = record.schemaVersion;
	if (version === CURRENT_OVERLAY_VERSION) return record;
	if (version === 1) {
		record = { ...record, schemaVersion: 2, additions: [], deletions: [] };
		version = 2;
	}
	if (version === 2) {
		record = { ...record, schemaVersion: 3 };
		version = 3;
	}
	if (version === CURRENT_OVERLAY_VERSION) return record;
	throw new Error(
		`overlay schemaVersion ${String(version)} not supported (current: ${CURRENT_OVERLAY_VERSION})`,
	);
};
