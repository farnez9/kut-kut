export { deserialize, type Project } from "./deserialize.ts";
export { migrate, UnknownSchemaVersionError } from "./migrations.ts";
export {
	CURRENT_SCHEMA_VERSION,
	type GroupJSON,
	type Layer2DJSON,
	type Layer3DJSON,
	type LayerJSON,
	type NumberClipJSON,
	type NumberKeyframeJSON,
	type NumberTrackJSON,
	type ProjectJSON,
	type SceneJSON,
	type SceneMetaJSON,
	type TimelineJSON,
	type TrackJSON,
	type TrackTargetJSON,
	type Transform2DJSON,
	type Transform3DJSON,
	type TransformJSON,
} from "./schema.ts";
export { serialize, serializeScene, serializeTimeline } from "./serialize.ts";
