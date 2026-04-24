import { CURRENT_SCHEMA_VERSION } from "./schema.ts";

export class UnknownSchemaVersionError extends Error {
	constructor(readonly version: unknown) {
		super(`Unknown project schema version: ${String(version)}`);
		this.name = "UnknownSchemaVersionError";
	}
}

const migrateV1ToV2 = (input: Record<string, unknown>): Record<string, unknown> => ({
	...input,
	schemaVersion: 2,
});

const migrateV2ToV3 = (input: Record<string, unknown>): Record<string, unknown> => ({
	...input,
	schemaVersion: 3,
});

const migrateV3ToV4 = (input: Record<string, unknown>): Record<string, unknown> => ({
	...input,
	schemaVersion: 4,
});

const migrateV4ToV5 = (input: Record<string, unknown>): Record<string, unknown> => ({
	...input,
	schemaVersion: 5,
});

export const migrate = (input: unknown): unknown => {
	if (input === null || typeof input !== "object") return input;
	let record = input as Record<string, unknown>;
	let version = record.schemaVersion;
	if (version === CURRENT_SCHEMA_VERSION) return record;
	if (version === 1) {
		record = migrateV1ToV2(record);
		version = record.schemaVersion;
	}
	if (version === 2) {
		record = migrateV2ToV3(record);
		version = record.schemaVersion;
	}
	if (version === 3) {
		record = migrateV3ToV4(record);
		version = record.schemaVersion;
	}
	if (version === 4) {
		record = migrateV4ToV5(record);
		version = record.schemaVersion;
	}
	if (version === CURRENT_SCHEMA_VERSION) return record;
	throw new UnknownSchemaVersionError(version);
};
