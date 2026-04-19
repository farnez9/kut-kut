import { type Accessor, createSignal, type JSX, onCleanup } from "solid-js";
import { startPointerDrag } from "./interaction.ts";

const MIN_HEIGHT = 140;
const MAX_MARGIN = 220;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export type TimelineResizerProps = {
	height: Accessor<number>;
	onHeight: (px: number) => void;
};

export const TimelineResizer = (props: TimelineResizerProps): JSX.Element => {
	const [dragging, setDragging] = createSignal(false);

	const maxHeight = (): number => Math.max(MIN_HEIGHT + 40, window.innerHeight - MAX_MARGIN);

	const onResize = (): void => {
		props.onHeight(clamp(props.height(), MIN_HEIGHT, maxHeight()));
	};

	window.addEventListener("resize", onResize);
	onCleanup(() => window.removeEventListener("resize", onResize));

	const onPointerDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const startHeight = props.height();
		setDragging(true);
		startPointerDrag(e, {
			onMove: (_dx, dy) => {
				props.onHeight(clamp(startHeight - dy, MIN_HEIGHT, maxHeight()));
			},
			onEnd: () => setDragging(false),
			onCancel: () => setDragging(false),
		});
	};

	return (
		<div
			class={`app-timeline__resize ${dragging() ? "is-dragging" : ""}`}
			onPointerDown={onPointerDown}
			title="Drag to resize the timeline"
			aria-hidden="true"
		/>
	);
};
