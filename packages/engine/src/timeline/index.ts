export { applyTimeline } from "./apply.ts";
export { type EasingFn, EasingName, easings } from "./easing.ts";
export { evaluateClip, evaluateTrack } from "./evaluate.ts";
export {
	type CreateAudioClipOptions,
	type CreateAudioTrackOptions,
	type CreateClipOptions,
	type CreateKeyframeOptions,
	type CreateTimelineOptions,
	type CreateTrackOptions,
	createAudioClip,
	createAudioTrack,
	createClip,
	createKeyframe,
	createTimeline,
	createTrack,
} from "./factories.ts";
export {
	createPlaybackController,
	type PlaybackController,
	type PlaybackControllerOptions,
	type PlaybackScheduler,
	type PlaybackState,
} from "./playback.ts";
export {
	type AudioClip,
	type AudioTrack,
	type Clip,
	isAudioTrack,
	isNumberTrack,
	isTrackTargetByPath,
	type Keyframe,
	type NumberTrack,
	type Timeline,
	type Track,
	TrackKind,
	type TrackTarget,
	type TrackTargetById,
	type TrackTargetByPath,
} from "./types.ts";
