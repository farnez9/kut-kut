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

export const migrate = (input: unknown): unknown => {
	if (input === null || typeof input !== "object") return input;
	const record = input as Record<string, unknown>;
	const version = record.schemaVersion;
	if (version === CURRENT_SCHEMA_VERSION) return record;
	if (version === 1) return migrateV1ToV2(record);
	throw new UnknownSchemaVersionError(version);
};
