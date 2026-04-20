import { createAudioPlayer, isAudioTrack, type Track } from "@kut-kut/engine";
import { createEffect, type JSX, on, onCleanup } from "solid-js";
import { usePlayback } from "../playback/index.ts";
import { useTimeline } from "../timeline/context.ts";
import { useAudio } from "./context.ts";

export const AudioPlayerHost = (): JSX.Element => {
	const playback = usePlayback();
	const timeline = useTimeline();
	const audio = useAudio();

	let disposed = false;
	let player: ReturnType<typeof createAudioPlayer> | null = null;

	const ensurePlayer = (): ReturnType<typeof createAudioPlayer> | null => {
		if (player || disposed) return player;
		const ctx = audio.context();
		if (!ctx) return null;
		const tracks = (): Track[] => timeline.timeline.tracks as Track[];
		player = createAudioPlayer({
			context: ctx,
			tracks,
			buffers: audio.buffers,
			playback: playback.controller,
		});
		return player;
	};

	createEffect(
		on(playback.state, (state) => {
			if (state === "playing") {
				audio.ensureContext();
				ensurePlayer();
			}
		}),
	);

	createEffect(() => {
		audio.context();
		audio.buffers().size;
		const tracks = timeline.timeline.tracks;
		for (const t of tracks) {
			if (!isAudioTrack(t)) continue;
			t.muted;
			t.gain;
			t.clips.length;
		}
		tracks.length;
		const p = ensurePlayer();
		p?.reconcile();
	});

	onCleanup(() => {
		disposed = true;
		player?.dispose();
		player = null;
	});

	return null;
};
