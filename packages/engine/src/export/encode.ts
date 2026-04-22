export type VideoFrameSource = AsyncIterable<{ frame: VideoFrame; keyFrame?: boolean }>;
export type AudioDataSource = AsyncIterable<AudioData>;

export type EncodeVideoStreamOptions = {
	config: VideoEncoderConfig;
	frames: VideoFrameSource;
	onChunk: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
	maxQueue?: number;
	signal?: AbortSignal;
};

export type EncodeAudioStreamOptions = {
	config: AudioEncoderConfig;
	data: AudioDataSource;
	onChunk: (chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void;
	maxQueue?: number;
	signal?: AbortSignal;
};

const waitQueueBelow = async (
	queueSize: () => number,
	max: number,
	signal?: AbortSignal,
): Promise<void> => {
	while (queueSize() > max) {
		if (signal?.aborted) return;
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}
};

export const encodeVideoStream = async (options: EncodeVideoStreamOptions): Promise<void> => {
	const maxQueue = options.maxQueue ?? 4;
	let fatal: Error | null = null;
	const encoder = new VideoEncoder({
		output: (chunk, meta) => options.onChunk(chunk, meta),
		error: (err) => {
			fatal = err instanceof Error ? err : new Error(String(err));
		},
	});
	encoder.configure(options.config);

	try {
		for await (const { frame, keyFrame } of options.frames) {
			if (fatal) {
				frame.close();
				throw fatal;
			}
			if (options.signal?.aborted) {
				frame.close();
				throw new DOMException("aborted", "AbortError");
			}
			await waitQueueBelow(() => encoder.encodeQueueSize, maxQueue, options.signal);
			encoder.encode(frame, { keyFrame: keyFrame ?? false });
			frame.close();
		}
		if (fatal) throw fatal;
		await encoder.flush();
		if (fatal) throw fatal;
	} finally {
		if (encoder.state !== "closed") encoder.close();
	}
};

export const encodeAudioStream = async (options: EncodeAudioStreamOptions): Promise<void> => {
	const maxQueue = options.maxQueue ?? 8;
	let fatal: Error | null = null;
	const encoder = new AudioEncoder({
		output: (chunk, meta) => options.onChunk(chunk, meta),
		error: (err) => {
			fatal = err instanceof Error ? err : new Error(String(err));
		},
	});
	encoder.configure(options.config);

	try {
		for await (const datum of options.data) {
			if (fatal) {
				datum.close();
				throw fatal;
			}
			if (options.signal?.aborted) {
				datum.close();
				throw new DOMException("aborted", "AbortError");
			}
			await waitQueueBelow(() => encoder.encodeQueueSize, maxQueue, options.signal);
			encoder.encode(datum);
			datum.close();
		}
		if (fatal) throw fatal;
		await encoder.flush();
		if (fatal) throw fatal;
	} finally {
		if (encoder.state !== "closed") encoder.close();
	}
};
