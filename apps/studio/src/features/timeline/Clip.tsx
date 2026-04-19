import type { Clip as ClipData } from "@kut-kut/engine";
import { For, type JSX } from "solid-js";
import { useTimeline } from "./context.ts";
import { startPointerDrag } from "./interaction.ts";
import { Keyframe } from "./Keyframe.tsx";
import { timeToPx } from "./mapping.ts";

export type ClipProps = {
	trackId: string;
	clip: ClipData<number>;
};

const CLICK_THRESHOLD_PX = 3;

export const Clip = (props: ClipProps): JSX.Element => {
	const t = useTimeline();

	const left = (): number => timeToPx(props.clip.start, t.view);
	const width = (): number =>
		Math.max(2, timeToPx(props.clip.end, t.view) - timeToPx(props.clip.start, t.view));
	const selected = (): boolean => t.view.selection === props.clip.id;

	const onPointerDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const clipStart = props.clip.start;
		const clipDuration = props.clip.end - props.clip.start;
		const duration = t.duration();
		let moved = false;

		startPointerDrag(e, {
			onMove: (dx) => {
				if (!moved && Math.abs(dx) < CLICK_THRESHOLD_PX) return;
				moved = true;
				const deltaSec = dx / t.view.zoom;
				const nextStart = Math.max(0, Math.min(duration - clipDuration, clipStart + deltaSec));
				t.moveClip(props.trackId, props.clip.id, nextStart);
			},
			onEnd: () => {
				if (!moved) t.selectClip(props.clip.id);
			},
		});
	};

	return (
		<div
			class={`tl-clip ${selected() ? "tl-clip--selected" : ""}`}
			style={{ transform: `translateX(${left()}px)`, width: `${width()}px` }}
			onPointerDown={onPointerDown}
		>
			<div class="tl-clip__keyframes">
				<For each={props.clip.keyframes}>
					{(kf) => <Keyframe clip={props.clip} keyframe={kf} />}
				</For>
			</div>
		</div>
	);
};
