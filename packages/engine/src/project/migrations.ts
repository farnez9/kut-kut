import { CURRENT_SCHEMA_VERSION } from "./schema.ts";

export class UnknownSchemaVersionError extends Error {
	constructor(readonly version: unknown) {
		super(`Unknown project schema version: ${String(version)}`);
		this.name = "UnknownSchemaVersionError";
	}
}

export const migrate = (input: unknown): unknown => {
	if (input === null || typeof input !== "object") return input;
	const version = (input as { schemaVersion?: unknown }).schemaVersion;
	if (version === CURRENT_SCHEMA_VERSION) return input;
	throw new UnknownSchemaVersionError(version);
};
