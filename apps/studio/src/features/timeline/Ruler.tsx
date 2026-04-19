import { type Accessor, For, type JSX, Show } from "solid-js";
import { usePlayback } from "../playback/index.ts";
import { useTimeline } from "./context.ts";
import { startPointerDrag } from "./interaction.ts";
import { pickTickStep, pxToTime, timeToPx } from "./mapping.ts";

export type RulerProps = {
	laneWidth: Accessor<number>;
};

type Tick = { time: number; x: number; major: boolean };

const formatTickLabel = (t: number): string => {
	if (t === 0) return "0s";
	const decimals = Number.isInteger(t) ? 0 : 1;
	return `${t.toFixed(decimals)}s`;
};

const isMajor = (time: number, step: number): boolean => {
	if (step >= 1) return true;
	const ratio = time / 1;
	return Math.abs(ratio - Math.round(ratio)) < step * 0.5;
};

export const Ruler = (props: RulerProps): JSX.Element => {
	const t = useTimeline();
	const playback = usePlayback();
	let el!: HTMLDivElement;

	const ticks = (): Tick[] => {
		const w = props.laneWidth();
		if (w === 0) return [];
		const { zoom, origin } = t.view;
		const step = pickTickStep(zoom);
		const duration = t.duration();
		const startTime = Math.max(0, Math.floor(origin / step) * step);
		const endTime = Math.min(duration, origin + w / zoom);
		const out: Tick[] = [];
		for (let tm = startTime; tm <= endTime + 1e-6; tm += step) {
			const rounded = Math.round(tm / step) * step;
			out.push({
				time: rounded,
				x: timeToPx(rounded, { zoom, origin }),
				major: isMajor(rounded, step),
			});
		}
		return out;
	};

	const seekAt = (clientX: number): void => {
		const rect = el.getBoundingClientRect();
		const px = clientX - rect.left;
		const clamped = Math.max(0, Math.min(t.duration(), pxToTime(px, t.view)));
		playback.seek(clamped);
	};

	const onPointerDown = (e: PointerEvent): void => {
		e.preventDefault();
		seekAt(e.clientX);
		startPointerDrag(e, {
			onMove: (_dx, _dy, ev) => seekAt(ev.clientX),
		});
	};

	return (
		<div class="tl-ruler" ref={el} onPointerDown={onPointerDown}>
			<For each={ticks()}>
				{(tick) => (
					<div
						class={`tl-ruler__tick ${tick.major ? "tl-ruler__tick--major" : ""}`}
						style={{ transform: `translateX(${tick.x}px)` }}
					>
						<Show when={tick.major}>
							<span class="tl-ruler__label">{formatTickLabel(tick.time)}</span>
						</Show>
					</div>
				)}
			</For>
		</div>
	);
};
