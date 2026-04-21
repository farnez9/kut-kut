import { evaluateCaptionTrack, isCaptionTrack } from "@kut-kut/engine";
import { createRoot, createSignal, For, type JSX, Show } from "solid-js";
import { usePlayback } from "../playback/index.ts";
import { useTimeline } from "../timeline/context.ts";

const KEY = "kk:captions:visible";

const readVisible = (): boolean => {
	if (typeof window === "undefined") return true;
	const raw = window.localStorage.getItem(KEY);
	return raw === null ? true : raw === "1";
};

const { visible, setVisible } = createRoot(() => {
	const [visible, setVisible] = createSignal(readVisible());
	return { visible, setVisible };
});

export const toggleCaptionVisibility = (): void => {
	const next = !visible();
	setVisible(next);
	if (typeof window !== "undefined") {
		window.localStorage.setItem(KEY, next ? "1" : "0");
	}
};

export const CaptionOverlay = (): JSX.Element => {
	const t = useTimeline();
	const playback = usePlayback();

	const captionTracks = () => t.timeline.tracks.filter(isCaptionTrack);

	const activeLines = (): string[] => {
		if (!visible()) return [];
		const time = playback.time();
		const lines: string[] = [];
		for (const track of captionTracks()) {
			const clip = evaluateCaptionTrack(track, time);
			if (clip && clip.text.trim().length > 0) lines.push(clip.text);
		}
		return lines;
	};

	return (
		<Show when={activeLines().length > 0}>
			<div class="caption-overlay" aria-live="polite">
				<div class="caption-overlay__box">
					<For each={activeLines()}>
						{(line) => <div class="caption-overlay__line">{line}</div>}
					</For>
				</div>
			</div>
		</Show>
	);
};
