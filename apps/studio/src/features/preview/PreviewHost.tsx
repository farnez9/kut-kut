import {
	applyTimeline,
	type Compositor,
	createCompositor,
	createPixiLayerRenderer,
	createThreeLayerRenderer,
	NodeType,
	type Scene,
	type Timeline,
} from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { usePlayback } from "../playback/index.ts";

export type PreviewHostProps = {
	scene: Scene;
	timeline: Timeline;
	drive?: (time: number, width: number, height: number) => void;
};

export const PreviewHost = (props: PreviewHostProps): JSX.Element => {
	const playback = usePlayback();
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
		const { width, height } = size();
		applyTimeline(props.scene, props.timeline, t);
		props.drive?.(t, width, height);
	});

	onCleanup(() => {
		observer.disconnect();
		compositor?.dispose();
		compositor = null;
	});

	return <div ref={host} class="preview-stage" />;
};
