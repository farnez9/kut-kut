import type { Clip, Keyframe as KeyframeData } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { useTimeline } from "./context.ts";
import { timeToPx } from "./mapping.ts";

export type KeyframeProps = {
	clip: Clip<number>;
	keyframe: KeyframeData<number>;
};

export const Keyframe = (props: KeyframeProps): JSX.Element => {
	const t = useTimeline();
	const absoluteTime = (): number => props.clip.start + props.keyframe.time;
	const x = (): number => timeToPx(absoluteTime(), t.view) - timeToPx(props.clip.start, t.view);

	const tooltip = (): string =>
		`t=${absoluteTime().toFixed(2)}s · value=${props.keyframe.value} · easing=${props.keyframe.easing}`;

	const onPointerDown = (e: PointerEvent): void => {
		e.stopPropagation();
	};

	return (
		<div
			class="tl-keyframe"
			style={{ left: `${x() - 4}px` }}
			onPointerDown={onPointerDown}
			title={tooltip()}
		/>
	);
};
