export { deserialize } from "./deserialize.ts";
export { migrate, UnknownSchemaVersionError } from "./migrations.ts";
export {
	CURRENT_SCHEMA_VERSION,
	type GroupJSON,
	type Layer2DJSON,
	type Layer3DJSON,
	type LayerJSON,
	type ProjectJSON,
	type SceneJSON,
	type SceneMetaJSON,
	type Transform2DJSON,
	type Transform3DJSON,
	type TransformJSON,
} from "./schema.ts";
export { serialize, serializeScene } from "./serialize.ts";
