import type { Clip as ClipData } from "@kut-kut/engine";
import { For, type JSX } from "solid-js";
import { moveClipCommand, resizeClipLeftCommand, resizeClipRightCommand } from "./commands.ts";
import { useTimeline } from "./context.ts";
import { startPointerDrag } from "./interaction.ts";
import { Keyframe } from "./Keyframe.tsx";
import { timeToPx } from "./mapping.ts";

export type ClipProps = {
	trackId: string;
	clip: ClipData<number>;
};

const CLICK_THRESHOLD_PX = 3;
const MIN_CLIP_SEC = 0.05;

export const Clip = (props: ClipProps): JSX.Element => {
	const t = useTimeline();

	const left = (): number => timeToPx(props.clip.start, t.view);
	const width = (): number =>
		Math.max(2, timeToPx(props.clip.end, t.view) - timeToPx(props.clip.start, t.view));
	const selected = (): boolean => t.view.selection.clipId === props.clip.id;

	const onBodyPointerDown = (e: PointerEvent): void => {
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
				if (!moved) {
					t.selectClip(props.clip.id);
					return;
				}
				t.push(moveClipCommand(props.trackId, props.clip.id, clipStart, props.clip.start));
			},
		});
	};

	const onLeftHandleDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const clipStart = props.clip.start;
		const clipEnd = props.clip.end;

		startPointerDrag(e, {
			onMove: (dx) => {
				const deltaSec = dx / t.view.zoom;
				const nextStart = Math.max(0, Math.min(clipEnd - MIN_CLIP_SEC, clipStart + deltaSec));
				t.resizeClipLeft(props.trackId, props.clip.id, nextStart);
			},
			onEnd: () => {
				if (props.clip.start === clipStart) return;
				t.push(resizeClipLeftCommand(props.trackId, props.clip.id, clipStart, props.clip.start));
			},
		});
	};

	const onRightHandleDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const clipStart = props.clip.start;
		const clipEnd = props.clip.end;
		const duration = t.duration();

		startPointerDrag(e, {
			onMove: (dx) => {
				const deltaSec = dx / t.view.zoom;
				const nextEnd = Math.max(clipStart + MIN_CLIP_SEC, Math.min(duration, clipEnd + deltaSec));
				t.resizeClipRight(props.trackId, props.clip.id, nextEnd);
			},
			onEnd: () => {
				if (props.clip.end === clipEnd) return;
				t.push(resizeClipRightCommand(props.trackId, props.clip.id, clipEnd, props.clip.end));
			},
		});
	};

	return (
		<div
			class={`tl-clip ${selected() ? "tl-clip--selected" : ""}`}
			style={{ transform: `translateX(${left()}px)`, width: `${width()}px` }}
			onPointerDown={onBodyPointerDown}
		>
			<div class="tl-clip__keyframes">
				<For each={props.clip.keyframes}>
					{(kf, index) => (
						<Keyframe trackId={props.trackId} clip={props.clip} keyframe={kf} index={index()} />
					)}
				</For>
			</div>
			<div
				class="tl-clip__handle tl-clip__handle--left"
				onPointerDown={onLeftHandleDown}
				aria-hidden="true"
			/>
			<div
				class="tl-clip__handle tl-clip__handle--right"
				onPointerDown={onRightHandleDown}
				aria-hidden="true"
			/>
		</div>
	);
};
