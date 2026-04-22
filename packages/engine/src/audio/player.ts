import type { Accessor } from "solid-js";
import type { PlaybackController, PlaybackState } from "../timeline/playback.ts";
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

// An active source keyed by clip.id. We keep the clip-shape fields so we can
// detect when an incoming reconcile actually changes something vs. fires
// spuriously — if all fields match the live clip + buffer identity, we leave
// the already-playing source alone. Restarting the BufferSource on every
// ambient reactive tick produces a zipper/metallic artefact.
type ActiveSource = {
	source: AudioBufferSourceNode;
	clipGain: GainNode;
	trackId: string;
	buffer: AudioBuffer;
	start: number;
	end: number;
	offset: number;
};

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
	const active = new Map<string, ActiveSource>();
	const trackGain = new Map<string, GainNode>();
	let disposed = false;
	let lastSeekToken = opts.playback.seekToken();
	let lastState: PlaybackState = opts.playback.state();

	const stopOne = (as: ActiveSource): void => {
		safeStop(as.source);
		safeDisconnect(as.source);
		safeDisconnect(as.clipGain);
	};

	const stopAllSources = (): void => {
		for (const [, as] of active) stopOne(as);
		active.clear();
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
		const seekToken = opts.playback.seekToken();

		// A seek or a state flip must force-restart every live source so they
		// resume from the new playhead. Otherwise we treat the call as a
		// steady-state reconciliation and only touch sources whose clip shape
		// or buffer actually changed.
		const seekChanged = seekToken !== lastSeekToken;
		const stateChanged = state !== lastState;
		lastSeekToken = seekToken;
		lastState = state;

		const aliveTrackIds = new Set<string>();
		for (const track of tracks) if (isAudioTrack(track)) aliveTrackIds.add(track.id);
		pruneTrackGain(aliveTrackIds);

		if (state !== "playing") {
			stopAllSources();
			return;
		}

		if (seekChanged || stateChanged) stopAllSources();

		const t = opts.playback.time();
		const ctxTime = opts.context.currentTime;
		const desiredClipIds = new Set<string>();

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
				desiredClipIds.add(clip.id);

				const existing = active.get(clip.id);
				const clipLevel = clip.muted ? 0 : clip.gain;
				if (
					existing &&
					existing.trackId === track.id &&
					existing.buffer === buffer &&
					existing.start === clip.start &&
					existing.end === clip.end &&
					existing.offset === clip.offset
				) {
					// Source already scheduled and nothing meaningful changed.
					// Mute/gain live on the GainNodes so they update without
					// touching the BufferSource.
					existing.clipGain.gain.value = clipLevel;
					continue;
				}

				if (existing) {
					stopOne(existing);
					active.delete(clip.id);
				}

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
				active.set(clip.id, {
					source,
					clipGain,
					trackId: track.id,
					buffer,
					start: clip.start,
					end: clip.end,
					offset: clip.offset,
				});
			}
		}

		// Stop any source whose clip is no longer present or no longer under
		// the playhead.
		for (const [clipId, as] of active) {
			if (desiredClipIds.has(clipId)) continue;
			stopOne(as);
			active.delete(clipId);
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
