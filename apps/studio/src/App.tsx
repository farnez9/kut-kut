import type { JSX } from "solid-js";
import {
	PlaybackControls,
	PlaybackProvider,
	useGlobalPlaybackHotkeys,
	usePlayback,
} from "./features/playback/index.ts";
import { createDemoScene, PreviewHost } from "./features/preview/index.ts";

const demo = createDemoScene();

const Wordmark = (): JSX.Element => (
	<div class="wordmark">
		<h1 class="wordmark__title">
			Kut<span class="wordmark__dot">·</span>Kut
		</h1>
		<span class="wordmark__tag">Studio</span>
	</div>
);

const TopbarRight = (): JSX.Element => (
	<div class="topbar-right">
		<span class="label">Scene</span>
		<span class="label label--hot">Demo · 30 fps</span>
	</div>
);

const PreviewMeta = (): JSX.Element => {
	const playback = usePlayback();
	const isLive = () => playback.state() === "playing";
	return (
		<div class="preview-meta">
			<span
				class={`preview-meta__dot ${isLive() ? "preview-meta__dot--live" : ""}`}
				aria-hidden="true"
			/>
			<span>{isLive() ? "Live" : "Paused"}</span>
			<span aria-hidden="true">·</span>
			<span>Pixi 2D + Three 3D</span>
		</div>
	);
};

const Shell = (): JSX.Element => {
	useGlobalPlaybackHotkeys();

	return (
		<div class="app-shell">
			<header class="app-topbar">
				<Wordmark />
				<PlaybackControls />
				<TopbarRight />
			</header>

			<aside class="app-left">
				<div class="panel-head">
					<span class="label">Scenes / Layers</span>
					<span class="panel-head__index">01</span>
				</div>
				<p class="panel-body">
					Project list lands in <em>session 06</em>. Until then, a hardcoded demo scene runs in the
					preview.
				</p>
			</aside>

			<section class="app-preview">
				<PreviewHost scene={demo.scene} timeline={demo.timeline} drive={demo.drive} />
				<div class="preview-frame" aria-hidden="true">
					<span />
				</div>
				<PreviewMeta />
				<div class="preview-aspect" aria-hidden="true">
					16:9 · 1920×1080
				</div>
			</section>

			<aside class="app-right">
				<div class="panel-head">
					<span class="label">Inspector</span>
					<span class="panel-head__index">02</span>
				</div>
				<p class="panel-body">
					Property editors bind to the current selection in <em>session 08</em>.
				</p>
			</aside>

			<section class="app-timeline">
				<div class="panel-head">
					<span class="label">Timeline</span>
					<span class="panel-head__index">03</span>
				</div>
				<div class="strip" aria-hidden="true">
					<div class="strip__ruler">
						<span>00:00</span>
						<span>01:00</span>
						<span>02:00</span>
						<span>03:00</span>
						<span>04:00</span>
					</div>
					<div class="strip__body">Ruler + tracks — session 07</div>
				</div>
			</section>
		</div>
	);
};

export function App() {
	return (
		<PlaybackProvider duration={demo.duration}>
			<Shell />
		</PlaybackProvider>
	);
}
