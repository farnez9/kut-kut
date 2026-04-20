import type { AudioClip, AudioTrack, Peaks } from "@kut-kut/engine";
import { Volume2, VolumeX } from "lucide-solid";
import { createEffect, For, type JSX } from "solid-js";
import { useAudio } from "../audio/context.ts";
import { useTimeline } from "./context.ts";
import { timeToPx } from "./mapping.ts";

export type AudioTrackRowProps = { track: AudioTrack };

const ROW_HEIGHT = 44;

const basename = (src: string): string => src.split("/").pop() ?? src;

const labelFor = (track: AudioTrack): string => {
	const first = track.clips[0];
	if (first) return basename(first.src);
	return `Audio · ${track.id.slice(0, 6)}`;
};

const AudioClipView = (props: { trackId: string; clip: AudioClip }): JSX.Element => {
	const t = useTimeline();
	const audio = useAudio();
	let canvas!: HTMLCanvasElement;

	const left = (): number => timeToPx(props.clip.start, t.view);
	const widthPx = (): number =>
		Math.max(2, timeToPx(props.clip.end, t.view) - timeToPx(props.clip.start, t.view));
	const selected = (): boolean => t.view.selection.clipId === props.clip.id;

	const draw = (peaks: Peaks | undefined, totalDur: number): void => {
		const dpr = window.devicePixelRatio || 1;
		const w = Math.max(2, Math.floor(widthPx()));
		const h = ROW_HEIGHT - 12;
		canvas.width = Math.floor(w * dpr);
		canvas.height = Math.floor(h * dpr);
		canvas.style.width = `${w}px`;
		canvas.style.height = `${h}px`;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		if (!peaks || totalDur <= 0) {
			ctx.fillStyle = "rgba(255,255,255,0.06)";
			ctx.fillRect(0, h / 2 - 0.5, w, 1);
			return;
		}
		const mid = h / 2;
		const half = h * 0.45;
		const buckets = peaks.bucketCount;
		const startU = props.clip.offset / totalDur;
		const endU = (props.clip.offset + (props.clip.end - props.clip.start)) / totalDur;
		ctx.fillStyle = "#64d8cb";
		ctx.beginPath();
		for (let x = 0; x < w; x++) {
			const u = startU + (endU - startU) * (x / w);
			const idx = Math.max(0, Math.min(buckets - 1, Math.floor(u * buckets)));
			const lo = peaks.min[idx] ?? 0;
			const hi = peaks.max[idx] ?? 0;
			const y0 = mid - hi * half;
			const y1 = mid - lo * half;
			ctx.rect(x, y0, 1, Math.max(1, y1 - y0));
		}
		ctx.fill();
	};

	createEffect(() => {
		const peaks = audio.peaks().get(props.clip.src);
		const buffer = audio.buffers().get(props.clip.src);
		t.view.zoom;
		props.clip.start;
		props.clip.end;
		props.clip.offset;
		draw(peaks, buffer?.duration ?? 0);
	});

	const onPointerDown = (e: PointerEvent): void => {
		e.stopPropagation();
		t.selectClip(props.clip.id);
	};

	return (
		<div
			class={`tl-audio-clip ${selected() ? "tl-audio-clip--selected" : ""}`}
			style={{ transform: `translateX(${left()}px)`, width: `${widthPx()}px` }}
			onPointerDown={onPointerDown}
			data-clip-id={props.clip.id}
		>
			<canvas ref={canvas} class="tl-audio-clip__canvas" />
		</div>
	);
};

export const AudioTrackRow = (props: AudioTrackRowProps): JSX.Element => {
	const t = useTimeline();

	const onMute = (): void => {
		t.setAudioTrackMuted(props.track.id, !props.track.muted);
	};
	const onGain = (e: Event): void => {
		const input = e.currentTarget as HTMLInputElement;
		const next = Number(input.value);
		if (Number.isFinite(next)) t.setAudioTrackGain(props.track.id, next);
	};

	return (
		<div class="tl-track-row tl-track-row--audio" data-track-id={props.track.id}>
			<div class="tl-track-row__label tl-audio-label">
				<span class="tl-audio-label__title" title={labelFor(props.track)}>
					{labelFor(props.track)}
				</span>
				<button
					type="button"
					class={`tl-audio-mute ${props.track.muted ? "tl-audio-mute--on" : ""}`}
					onClick={onMute}
					aria-pressed={props.track.muted}
					aria-label={props.track.muted ? "Unmute" : "Mute"}
					title={props.track.muted ? "Unmute" : "Mute"}
				>
					{props.track.muted ? (
						<VolumeX size={14} strokeWidth={2.25} aria-hidden="true" />
					) : (
						<Volume2 size={14} strokeWidth={2.25} aria-hidden="true" />
					)}
				</button>
				<input
					class="tl-audio-gain"
					type="range"
					min="0"
					max="1.5"
					step="0.01"
					value={props.track.gain}
					onChange={onGain}
					title={`Gain ${props.track.gain.toFixed(2)}`}
				/>
			</div>
			<div class="tl-track-row__lane">
				<For each={props.track.clips}>
					{(clip) => <AudioClipView trackId={props.track.id} clip={clip} />}
				</For>
			</div>
		</div>
	);
};
