import type { Accessor } from "solid-js";
import type { PlaybackController } from "../timeline/playback.ts";
import { isAudioTrack, type Track } from "../timeline/types.ts";

export type AudioPlayerOptions = {
	context: AudioContext;
	destination?: AudioNode;
	tracks: Accessor<Track[]>;
	buffers: Accessor<Map<string, AudioBuffer>>;
	playback: PlaybackController;
};

export type AudioPlayer = {
	dispose: () => void;
	reconcile: () => void;
};

type ActiveSource = { source: AudioBufferSourceNode; clipGain: GainNode };

const safeDisconnect = (node: AudioNode): void => {
	try {
		node.disconnect();
	} catch {}
};

const safeStop = (node: AudioBufferSourceNode): void => {
	try {
		node.stop();
	} catch {}
};

export const createAudioPlayer = (opts: AudioPlayerOptions): AudioPlayer => {
	const destination = opts.destination ?? opts.context.destination;
	let active: ActiveSource[] = [];
	const trackGain = new Map<string, GainNode>();
	let disposed = false;

	const stopAllSources = (): void => {
		for (const { source, clipGain } of active) {
			safeStop(source);
			safeDisconnect(source);
			safeDisconnect(clipGain);
		}
		active = [];
	};

	const pruneTrackGain = (aliveIds: Set<string>): void => {
		for (const [id, node] of trackGain) {
			if (aliveIds.has(id)) continue;
			safeDisconnect(node);
			trackGain.delete(id);
		}
	};

	const reconcile = (): void => {
		if (disposed) return;

		const tracks = opts.tracks();
		const buffers = opts.buffers();
		const state = opts.playback.state();

		stopAllSources();

		const aliveIds = new Set<string>();
		for (const track of tracks) if (isAudioTrack(track)) aliveIds.add(track.id);
		pruneTrackGain(aliveIds);

		if (state !== "playing") return;

		const t = opts.playback.time();
		const ctxTime = opts.context.currentTime;

		for (const track of tracks) {
			if (!isAudioTrack(track)) continue;
			const trackLevel = track.muted ? 0 : track.gain;
			let tg = trackGain.get(track.id);
			if (!tg) {
				tg = opts.context.createGain();
				tg.connect(destination);
				trackGain.set(track.id, tg);
			}
			tg.gain.value = trackLevel;
			if (trackLevel === 0) continue;

			for (const clip of track.clips) {
				if (t < clip.start || t >= clip.end) continue;
				const buffer = buffers.get(clip.src);
				if (!buffer) continue;
				const clipLevel = clip.muted ? 0 : clip.gain;
				if (clipLevel === 0) continue;
				const source = opts.context.createBufferSource();
				source.buffer = buffer;
				const clipGain = opts.context.createGain();
				clipGain.gain.value = clipLevel;
				source.connect(clipGain);
				clipGain.connect(tg);
				const offset = clip.offset + (t - clip.start);
				const duration = clip.end - t;
				source.start(ctxTime, offset);
				source.stop(ctxTime + duration);
				active.push({ source, clipGain });
			}
		}
	};

	const unsubscribe = opts.playback.onTransition(reconcile);
	reconcile();

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
		stopAllSources();
		for (const [, node] of trackGain) safeDisconnect(node);
		trackGain.clear();
	};

	return { dispose, reconcile };
};
