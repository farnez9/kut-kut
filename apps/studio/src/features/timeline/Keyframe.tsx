import type { Clip, EasingName, Keyframe as KeyframeData } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { moveKeyframeCommand } from "./commands.ts";
import { useTimeline } from "./context.ts";
import { startPointerDrag } from "./interaction.ts";
import { timeToPx } from "./mapping.ts";

export type KeyframeProps = {
	trackId: string;
	clip: Clip<number>;
	keyframe: KeyframeData<number>;
	index: number;
};

const CLICK_THRESHOLD_PX = 3;

const easingClass = (name: EasingName): string => {
	if (name.startsWith("ease-in-out")) return "tl-keyframe--easing-inout";
	if (name.startsWith("ease-in")) return "tl-keyframe--easing-in";
	if (name.startsWith("ease-out")) return "tl-keyframe--easing-out";
	if (name === "step-hold") return "tl-keyframe--easing-step";
	return "tl-keyframe--easing-linear";
};

export const Keyframe = (props: KeyframeProps): JSX.Element => {
	const t = useTimeline();
	const absoluteTime = (): number => props.clip.start + props.keyframe.time;
	const x = (): number => timeToPx(absoluteTime(), t.view) - timeToPx(props.clip.start, t.view);

	const selected = (): boolean => t.view.selection.keyframeId === `${props.clip.id}:${props.index}`;

	const tooltip = (): string =>
		`t=${absoluteTime().toFixed(2)}s · value=${props.keyframe.value} · easing=${props.keyframe.easing}`;

	const onPointerDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const clipDuration = props.clip.end - props.clip.start;
		const startTime = props.keyframe.time;
		const startIndex = props.index;
		let moved = false;

		startPointerDrag(e, {
			onMove: (dx) => {
				if (!moved && Math.abs(dx) < CLICK_THRESHOLD_PX) return;
				moved = true;
				const deltaSec = dx / t.view.zoom;
				const nextTime = Math.max(0, Math.min(clipDuration, startTime + deltaSec));
				t.setKeyframeTime(props.trackId, props.clip.id, startIndex, nextTime);
			},
			onEnd: () => {
				if (!moved) {
					t.selectKeyframe(props.clip.id, startIndex);
					return;
				}
				const track = t.timeline.tracks.find((tr) => tr.id === props.trackId);
				const clip = track?.clips.find((c) => c.id === props.clip.id);
				const finalTime = clip?.keyframes[startIndex]?.time ?? startTime;
				if (finalTime === startTime) {
					t.sortClipKeyframes(props.trackId, props.clip.id);
					return;
				}
				t.push(
					moveKeyframeCommand(
						t.mutate,
						props.trackId,
						props.clip.id,
						startIndex,
						startTime,
						finalTime,
					),
				);
			},
			onCancel: () => {
				t.setKeyframeTime(props.trackId, props.clip.id, startIndex, startTime);
			},
		});
	};

	return (
		<div
			class={`tl-keyframe ${easingClass(props.keyframe.easing)} ${selected() ? "tl-keyframe--selected" : ""}`}
			style={{ left: `${x() - 4}px` }}
			onPointerDown={onPointerDown}
			title={tooltip()}
		/>
	);
};
