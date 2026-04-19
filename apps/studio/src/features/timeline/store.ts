import type { Clip, Timeline, Track } from "@kut-kut/engine";
import { createStore, produce } from "solid-js/store";

export const createTimelineStore = (initial: Timeline) => {
	const [timeline, setTimeline] = createStore<Timeline>(initial);

	const round = (v: number): number => Math.round(v * 1000) / 1000;

	const moveClip = (trackId: string, clipId: string, newStart: number): void => {
		setTimeline(
			produce((draft) => {
				const track: Track | undefined = draft.tracks.find((t) => t.id === trackId);
				if (!track) return;
				const clip: Clip<number> | undefined = track.clips.find((c) => c.id === clipId);
				if (!clip) return;
				const duration = clip.end - clip.start;
				const start = round(newStart);
				clip.start = start;
				clip.end = round(start + duration);
			}),
		);
	};

	return { timeline, setTimeline, moveClip };
};
