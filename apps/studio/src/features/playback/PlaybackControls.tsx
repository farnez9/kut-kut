import { Pause, Play, SkipBack } from "lucide-solid";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { usePlayback } from "./context.ts";

const formatTimecode = (seconds: number): string => {
	const clamped = Math.max(0, seconds);
	const mm = Math.floor(clamped / 60);
	const ss = Math.floor(clamped % 60);
	const cs = Math.floor((clamped * 100) % 100);
	return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

export const PlaybackControls = (): JSX.Element => {
	const playback = usePlayback();
	const isPlaying = () => playback.state() === "playing";

	return (
		<div class="playback">
			<fieldset class="playback__group">
				<legend class="playback__legend">Playback</legend>
				<button
					type="button"
					class="playback__btn"
					onClick={playback.restart}
					aria-label="Restart (Home)"
					title="Restart · Home"
				>
					<SkipBack size={12} strokeWidth={2} />
				</button>
				<button
					type="button"
					class={`playback__btn playback__btn--primary ${isPlaying() ? "is-playing" : ""}`}
					onClick={playback.toggle}
					aria-label={isPlaying() ? "Pause (Space)" : "Play (Space)"}
					title={isPlaying() ? "Pause · Space" : "Play · Space"}
				>
					<Show when={isPlaying()} fallback={<Play size={13} strokeWidth={2} />}>
						<Pause size={13} strokeWidth={2} />
					</Show>
				</button>
			</fieldset>
			<span class={`timecode ${isPlaying() ? "timecode--live" : ""}`}>
				<span>{formatTimecode(playback.time())}</span>
				<span class="timecode__sep">/</span>
				<span class="timecode__total">{formatTimecode(playback.duration())}</span>
			</span>
		</div>
	);
};
