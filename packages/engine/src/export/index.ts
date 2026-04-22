import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { AudioBufferLike } from "../audio/peaks.ts";
import { applyOverlay, applyOverlayMeta } from "../overlay/apply.ts";
import type { Overlay } from "../overlay/schema.ts";
import type { Compositor } from "../render/compositor.ts";
import type { Scene } from "../scene/scene.ts";
import { applyTimeline } from "../timeline/apply.ts";
import type { Timeline, Track } from "../timeline/types.ts";
import { encodeAudioStream, encodeVideoStream } from "./encode.ts";
import { mixTimelineAudio } from "./mix.ts";

export { mixTimelineAudio } from "./mix.ts";

export type ExportProgress = {
	framesDone: number;
	totalFrames: number;
};

export type ExportVideoOptions = {
	scene: Scene;
	timeline: Timeline;
	overlay?: Overlay;
	audioTracks?: Track[];
	audioBuffers?: Map<string, AudioBufferLike>;
	compositor: Compositor;
	output?: HTMLCanvasElement;
	videoBitrate?: number;
	audioBitrate?: number;
	audioSampleRate?: number;
	videoCodec?: string;
	signal?: AbortSignal;
	onProgress?: (progress: ExportProgress) => void;
};

const DEFAULT_VIDEO_BITRATE = 8_000_000;
const DEFAULT_AUDIO_BITRATE = 128_000;
const DEFAULT_AUDIO_SAMPLE_RATE = 48_000;
const DEFAULT_VIDEO_CODEC = "avc1.640028";
const DEFAULT_AUDIO_CODEC = "mp4a.40.2";
const AUDIO_CHANNELS = 2;
const AUDIO_FRAME_SIZE = 1024;

const ensureOutputCanvas = (
	provided: HTMLCanvasElement | undefined,
	width: number,
	height: number,
): HTMLCanvasElement => {
	const canvas = provided ?? document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

// Solid effects run at microtask edges; yielding lets timeline writes propagate
// to Pixi/Three property bindings before we draw the frame.
const flushMicrotasks = (): Promise<void> => Promise.resolve();

async function* renderVideoFrames(opts: {
	scene: Scene;
	timeline: Timeline;
	overlay: Overlay | undefined;
	compositor: Compositor;
	output: HTMLCanvasElement;
	totalFrames: number;
	fps: number;
	gopSize: number;
	signal: AbortSignal | undefined;
	onProgress: ((p: ExportProgress) => void) | undefined;
}): AsyncGenerator<{ frame: VideoFrame; keyFrame: boolean }> {
	const frameDurationUs = 1_000_000 / opts.fps;
	for (let f = 0; f < opts.totalFrames; f++) {
		if (opts.signal?.aborted) return;
		const t = f / opts.fps;
		if (opts.overlay) applyOverlay(opts.scene, opts.overlay);
		applyTimeline(opts.scene, opts.timeline, t);
		await flushMicrotasks();
		opts.compositor.renderFrame();
		opts.compositor.composite(opts.output);
		const frame = new VideoFrame(opts.output, {
			timestamp: Math.round(f * frameDurationUs),
			duration: Math.round(frameDurationUs),
		});
		yield { frame, keyFrame: f % opts.gopSize === 0 };
		opts.onProgress?.({ framesDone: f + 1, totalFrames: opts.totalFrames });
	}
}

async function* streamAudioData(
	buffer: AudioBufferLike,
	sampleRate: number,
	signal: AbortSignal | undefined,
): AsyncGenerator<AudioData> {
	const channels = Math.min(AUDIO_CHANNELS, buffer.numberOfChannels);
	const channelData: Float32Array[] = [];
	for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
	const totalFrames = buffer.length;

	for (let offset = 0; offset < totalFrames; offset += AUDIO_FRAME_SIZE) {
		if (signal?.aborted) return;
		const frames = Math.min(AUDIO_FRAME_SIZE, totalFrames - offset);
		const planar = new Float32Array(channels * frames);
		for (let c = 0; c < channels; c++) {
			planar.set(channelData[c]!.subarray(offset, offset + frames), c * frames);
		}
		const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
		yield new AudioData({
			format: "f32-planar",
			sampleRate,
			numberOfFrames: frames,
			numberOfChannels: channels,
			timestamp: timestampUs,
			data: planar,
		});
	}
}

export const exportVideo = async (options: ExportVideoOptions): Promise<Blob> => {
	if (typeof VideoEncoder === "undefined") {
		throw new Error("exportVideo: VideoEncoder is not supported in this browser");
	}
	const { scene, compositor } = options;
	if (options.overlay) applyOverlayMeta(scene, options.overlay);
	const { width, height, fps, duration } = scene.meta;
	const totalFrames = Math.max(1, Math.round(duration * fps));
	const gopSize = Math.max(1, Math.round(fps * 2));
	const output = ensureOutputCanvas(options.output, width, height);

	const audioTracks = options.audioTracks ?? [];
	const audioBuffers = options.audioBuffers ?? new Map<string, AudioBufferLike>();
	const hasAudio =
		typeof AudioEncoder !== "undefined" &&
		audioTracks.some((track) => track.kind === "audio" && track.clips.length > 0);

	const audioSampleRate = options.audioSampleRate ?? DEFAULT_AUDIO_SAMPLE_RATE;
	const videoCodec = options.videoCodec ?? DEFAULT_VIDEO_CODEC;

	const target = new ArrayBufferTarget();
	const muxer = new Muxer({
		target,
		fastStart: "in-memory",
		video: { codec: "avc", width, height, frameRate: fps },
		audio: hasAudio
			? { codec: "aac", numberOfChannels: AUDIO_CHANNELS, sampleRate: audioSampleRate }
			: undefined,
	});

	const videoPromise = encodeVideoStream({
		config: {
			codec: videoCodec,
			width,
			height,
			bitrate: options.videoBitrate ?? DEFAULT_VIDEO_BITRATE,
			framerate: fps,
		},
		frames: renderVideoFrames({
			scene,
			timeline: options.timeline,
			overlay: options.overlay,
			compositor,
			output,
			totalFrames,
			fps,
			gopSize,
			signal: options.signal,
			onProgress: options.onProgress,
		}),
		onChunk: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
		signal: options.signal,
	});

	let audioPromise: Promise<void> = Promise.resolve();
	if (hasAudio) {
		audioPromise = (async (): Promise<void> => {
			const mixed = await mixTimelineAudio({
				tracks: audioTracks,
				buffers: audioBuffers,
				duration,
				sampleRate: audioSampleRate,
				numberOfChannels: AUDIO_CHANNELS,
			});
			await encodeAudioStream({
				config: {
					codec: DEFAULT_AUDIO_CODEC,
					numberOfChannels: AUDIO_CHANNELS,
					sampleRate: audioSampleRate,
					bitrate: options.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
				},
				data: streamAudioData(mixed, audioSampleRate, options.signal),
				onChunk: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
				signal: options.signal,
			});
		})();
	}

	await Promise.all([videoPromise, audioPromise]);
	if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");

	muxer.finalize();
	return new Blob([target.buffer], { type: "video/mp4" });
};
