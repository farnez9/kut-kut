import {
	applyOverlay,
	applyTimeline,
	type Compositor,
	createCompositor,
	createPixiLayerRenderer,
	createThreeLayerRenderer,
	NodeType,
	type Scene,
} from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, useContext } from "solid-js";
import { OverlayContext } from "../overlay/context.ts";
import { usePlayback } from "../playback/index.ts";
import { useTimeline } from "../timeline/context.ts";

export type PreviewHostProps = {
	scene: Scene;
};

export const PreviewHost = (props: PreviewHostProps): JSX.Element => {
	const playback = usePlayback();
	const timelineCtx = useTimeline();
	const overlayCtx = useContext(OverlayContext);
	let host!: HTMLDivElement;

	const [size, setSize] = createSignal({ width: 0, height: 0 });
	let compositor: Compositor | null = null;

	onMount(async () => {
		const c = createCompositor({
			host,
			scene: props.scene,
			createLayerRenderer: ({ layer, meta }) =>
				layer.type === NodeType.Layer2D
					? createPixiLayerRenderer({ layer, meta })
					: createThreeLayerRenderer({ layer, meta }),
		});
		compositor = c;
		await c.mount();
		const { width, height } = size();
		if (width > 0 && height > 0) c.setSize(width, height);
	});

	const observer = new ResizeObserver((entries) => {
		const entry = entries[0];
		if (!entry) return;
		const { width, height } = entry.contentRect;
		setSize({ width, height });
	});

	onMount(() => observer.observe(host));

	createEffect(() => {
		const { width, height } = size();
		if (compositor && width > 0 && height > 0) compositor.setSize(width, height);
	});

	createEffect(() => {
		const t = playback.time();
		if (overlayCtx) applyOverlay(props.scene, overlayCtx.overlay);
		applyTimeline(props.scene, timelineCtx.timeline, t);
	});

	onCleanup(() => {
		observer.disconnect();
		compositor?.dispose();
		compositor = null;
	});

	return <div ref={host} class="preview-stage" />;
};
