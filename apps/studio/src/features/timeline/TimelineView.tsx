import type { JSX } from "solid-js";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { usePlayback } from "../playback/index.ts";
import { useTimeline } from "./context.ts";
import { LABEL_WIDTH } from "./layout.ts";
import { pxToTime, timeToPx } from "./mapping.ts";
import { Ruler } from "./Ruler.tsx";
import { TrackRow } from "./TrackRow.tsx";

const MIN_ZOOM = 40;
const MAX_ZOOM = 400;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const Playhead = (props: { laneWidth: () => number }): JSX.Element => {
	const t = useTimeline();
	const playback = usePlayback();
	let el!: HTMLDivElement;

	createEffect(() => {
		const time = playback.time();
		const x = timeToPx(time, t.view);
		const w = props.laneWidth();
		const visible = w > 0 && x >= 0 && x <= w;
		el.style.opacity = visible ? "1" : "0";
		if (visible) el.style.transform = `translateX(${x}px)`;
	});

	return <div class="tl-playhead" ref={el} aria-hidden="true" />;
};

const SaveIndicator = (): JSX.Element => {
	const t = useTimeline();
	return (
		<Show when={t.saveState() === "error"}>
			<div class="tl-save-banner" role="status">
				Timeline save failed — {t.saveError()?.message ?? "unknown error"}
			</div>
		</Show>
	);
};

export const TimelineView = (): JSX.Element => {
	const t = useTimeline();
	let container!: HTMLDivElement;
	const [width, setWidth] = createSignal(0);
	const laneWidth = (): number => Math.max(0, width() - LABEL_WIDTH);
	let fitApplied = false;

	const observer = new ResizeObserver((entries) => {
		const entry = entries[0];
		if (!entry) return;
		setWidth(entry.contentRect.width);
	});

	onMount(() => observer.observe(container));
	onCleanup(() => observer.disconnect());

	createEffect(() => {
		const lw = laneWidth();
		if (fitApplied || lw === 0) return;
		const dur = t.duration();
		if (dur <= 0) return;
		const fit = clamp(lw / dur, MIN_ZOOM, MAX_ZOOM);
		t.setView({ zoom: fit, origin: 0 });
		fitApplied = true;
	});

	const onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		if (e.ctrlKey || e.metaKey) {
			const rect = container.getBoundingClientRect();
			const cursorPx = e.clientX - rect.left - LABEL_WIDTH;
			if (cursorPx < 0) return;
			const cursorTime = pxToTime(cursorPx, t.view);
			const nextZoom = clamp(t.view.zoom * (1 - e.deltaY / 500), MIN_ZOOM, MAX_ZOOM);
			const nextOrigin = cursorTime - cursorPx / nextZoom;
			t.setView({ zoom: nextZoom, origin: nextOrigin });
		} else {
			const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
			t.setView("origin", (o) => o + delta / t.view.zoom);
		}
	};

	const onBodyPointerDown = (): void => {
		t.selectClip(null);
	};

	return (
		<div class="tl-strip" ref={container} onWheel={onWheel}>
			<SaveIndicator />
			<Ruler laneWidth={laneWidth} />
			<div class="tl-body" onPointerDown={onBodyPointerDown}>
				<Show
					when={t.timeline.tracks.length > 0}
					fallback={
						<div class="tl-body__empty">
							<span class="label">No tracks yet — add one in session 08.</span>
						</div>
					}
				>
					<For each={t.timeline.tracks}>{(track) => <TrackRow track={track} />}</For>
				</Show>
			</div>
			<Playhead laneWidth={laneWidth} />
		</div>
	);
};
