import type { AudioBufferLike } from "../audio/peaks.ts";
import type { AudioTrack, Track } from "../timeline/types.ts";
import { isAudioTrack } from "../timeline/types.ts";

export type MixTimelineAudioOptions = {
	tracks: Track[];
	buffers: Map<string, AudioBufferLike>;
	duration: number;
	sampleRate: number;
	numberOfChannels?: number;
};

type OfflineCtor = new (
	channels: number,
	length: number,
	sampleRate: number,
) => OfflineAudioContext;

const offlineCtor = (): OfflineCtor => {
	const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor };
	if (!g.OfflineAudioContext) {
		throw new Error("mixTimelineAudio: OfflineAudioContext is not available");
	}
	return g.OfflineAudioContext;
};

const scheduleClips = (
	ctx: OfflineAudioContext,
	track: AudioTrack,
	buffers: Map<string, AudioBufferLike>,
	duration: number,
): void => {
	if (track.muted || track.gain === 0) return;
	const trackGain = ctx.createGain();
	trackGain.gain.value = track.gain;
	trackGain.connect(ctx.destination);

	for (const clip of track.clips) {
		if (clip.muted || clip.gain === 0) continue;
		if (clip.end <= 0 || clip.start >= duration) continue;
		const buffer = buffers.get(clip.src);
		if (!buffer) continue;

		const startAt = Math.max(0, clip.start);
		const endAt = Math.min(duration, clip.end);
		if (endAt <= startAt) continue;
		const offset = clip.offset + Math.max(0, -clip.start);
		const clipDuration = endAt - startAt;

		const source = ctx.createBufferSource();
		source.buffer = buffer as AudioBuffer;
		const clipGain = ctx.createGain();
		clipGain.gain.value = clip.gain;
		source.connect(clipGain);
		clipGain.connect(trackGain);
		source.start(startAt, offset, clipDuration);
	}
};

export const mixTimelineAudio = async (options: MixTimelineAudioOptions): Promise<AudioBuffer> => {
	const channels = options.numberOfChannels ?? 2;
	const length = Math.max(1, Math.ceil(options.duration * options.sampleRate));
	const Ctor = offlineCtor();
	const ctx = new Ctor(channels, length, options.sampleRate);

	for (const track of options.tracks) {
		if (!isAudioTrack(track)) continue;
		scheduleClips(ctx, track, options.buffers, options.duration);
	}

	return ctx.startRendering();
};
