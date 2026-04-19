export {
	deserialize,
	deserializeTimeline,
	type Project,
	parseTimeline,
} from "./deserialize.ts";
export { migrate, UnknownSchemaVersionError } from "./migrations.ts";
export {
	type AudioClipJSON,
	type AudioTrackJSON,
	type BoxJSON,
	CURRENT_SCHEMA_VERSION,
	type GroupJSON,
	type Layer2DJSON,
	type Layer3DJSON,
	type LayerJSON,
	type NodeJSON,
	type NumberClipJSON,
	type NumberKeyframeJSON,
	type NumberTrackJSON,
	type ProjectJSON,
	type RectJSON,
	type SceneJSON,
	type SceneMetaJSON,
	type TimelineJSON,
	type TrackJSON,
	type TrackTargetByIdJSON,
	type TrackTargetByPathJSON,
	type TrackTargetJSON,
	type Transform2DJSON,
	type Transform3DJSON,
	type TransformJSON,
} from "./schema.ts";
export { serialize, serializeScene, serializeTimeline } from "./serialize.ts";
