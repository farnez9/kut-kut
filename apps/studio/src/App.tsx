import type { JSX } from "solid-js";
import { createSignal, Show, useContext } from "solid-js";
import { Inspector, InspectorHint } from "./features/inspector/index.ts";
import { PlaybackContext } from "./features/playback/context.ts";
import {
	PlaybackControls,
	PlaybackProvider,
	useGlobalPlaybackHotkeys,
} from "./features/playback/index.ts";
import { PreviewHost } from "./features/preview/index.ts";
import {
	type ProjectBundle,
	ProjectList,
	ProjectProvider,
	useProject,
} from "./features/project/index.ts";
import { TimelineContext } from "./features/timeline/context.ts";
import { TimelineProvider, TimelineResizer, TimelineView } from "./features/timeline/index.ts";

const INITIAL_TIMELINE_HEIGHT = 260;

const Wordmark = (): JSX.Element => (
	<div class="wordmark">
		<h1 class="wordmark__title">
			Kut<span class="wordmark__dot">·</span>Kut
		</h1>
		<span class="wordmark__tag">Studio</span>
	</div>
);

const TopbarRight = (): JSX.Element => {
	const project = useProject();
	return (
		<div class="topbar-right">
			<span class="label">Scene</span>
			<span class="label label--hot">
				<Show when={project.bundle()} keyed fallback="—">
					{(b) => `${b.name} · ${b.scene.meta.fps} fps`}
				</Show>
			</span>
		</div>
	);
};

const TopbarPlayback = (): JSX.Element => {
	const ctx = useContext(PlaybackContext);
	return (
		<Show when={ctx}>
			<PlaybackControls />
		</Show>
	);
};

const PreviewMeta = (): JSX.Element => {
	const ctx = useContext(PlaybackContext);
	const isLive = () => ctx?.state() === "playing";
	return (
		<div class="preview-meta">
			<span
				class={`preview-meta__dot ${isLive() ? "preview-meta__dot--live" : ""}`}
				aria-hidden="true"
			/>
			<span>{isLive() ? "Live" : ctx ? "Paused" : "Idle"}</span>
			<span aria-hidden="true">·</span>
			<span>Pixi 2D + Three 3D</span>
		</div>
	);
};

const PreviewContent = (): JSX.Element => {
	const project = useProject();
	return (
		<Show
			when={project.state() !== "idle" && project.state() !== "loading"}
			fallback={<PreviewMessage label="Loading…" />}
		>
			<Show
				when={project.state() !== "error"}
				fallback={
					<PreviewMessage
						label="Load failed"
						detail={project.error()?.message ?? "unknown error"}
						retry
					/>
				}
			>
				<Show
					when={project.bundle()}
					keyed
					fallback={
						<PreviewMessage
							label="No projects"
							detail="Create projects/<name>/scene.ts to get started."
						/>
					}
				>
					{(b) => <PreviewHost scene={b.scene} />}
				</Show>
			</Show>
		</Show>
	);
};

type PreviewMessageProps = { label: string; detail?: string; retry?: boolean };

const PreviewMessage = (props: PreviewMessageProps): JSX.Element => {
	const project = useProject();
	return (
		<div class="preview-message">
			<span class="label label--hot">{props.label}</span>
			<Show when={props.detail}>
				<p class="preview-message__detail">{props.detail}</p>
			</Show>
			<Show when={props.retry}>
				<button type="button" class="preview-message__retry" onClick={() => project.reload()}>
					Retry
				</button>
			</Show>
		</div>
	);
};

const PreviewAspect = (): JSX.Element => {
	const project = useProject();
	return (
		<Show when={project.bundle()} keyed>
			{(b) => (
				<div class="preview-aspect" aria-hidden="true">
					{`${aspectLabel(b)} · ${b.scene.meta.width}×${b.scene.meta.height}`}
				</div>
			)}
		</Show>
	);
};

const aspectLabel = (b: ProjectBundle): string => {
	const { width, height } = b.scene.meta;
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	const d = gcd(width, height);
	return `${width / d}:${height / d}`;
};

const PlaybackHotkeys = (): JSX.Element => {
	useGlobalPlaybackHotkeys();
	return null;
};

const TimelineBody = (): JSX.Element => {
	const ctx = useContext(TimelineContext);
	return (
		<Show
			when={ctx}
			fallback={
				<div class="tl-strip tl-strip--empty" aria-hidden="true">
					<span class="label">Load a project to see its timeline.</span>
				</div>
			}
		>
			<TimelineView />
		</Show>
	);
};

const InspectorBody = (): JSX.Element => {
	const ctx = useContext(TimelineContext);
	return (
		<Show when={ctx} fallback={<p class="panel-body">Load a project to inspect selections.</p>}>
			<Inspector />
		</Show>
	);
};

const Shell = (): JSX.Element => {
	const [tlHeight, setTlHeight] = createSignal(INITIAL_TIMELINE_HEIGHT);
	return (
		<div class="app-shell" style={{ "--tl-height": `${tlHeight()}px` }}>
			<header class="app-topbar">
				<Wordmark />
				<TopbarPlayback />
				<TopbarRight />
			</header>

			<aside class="app-left">
				<div class="panel-head">
					<span class="label">Projects</span>
					<span class="panel-head__index">01</span>
				</div>
				<ProjectList />
			</aside>

			<section class="app-preview">
				<PreviewContent />
				<div class="preview-frame" aria-hidden="true">
					<span />
				</div>
				<PreviewMeta />
				<PreviewAspect />
			</section>

			<aside class="app-right">
				<div class="panel-head">
					<span class="label">Inspector</span>
					<InspectorHint />
				</div>
				<InspectorBody />
			</aside>

			<section class="app-timeline">
				<TimelineResizer height={tlHeight} onHeight={setTlHeight} />
				<div class="panel-head">
					<span class="label">Timeline</span>
					<span class="panel-head__index">03</span>
				</div>
				<TimelineBody />
			</section>
		</div>
	);
};

const Root = (): JSX.Element => {
	const project = useProject();
	return (
		<Show when={project.bundle()} keyed fallback={<Shell />}>
			{(b) => (
				<PlaybackProvider duration={b.scene.meta.duration}>
					<PlaybackHotkeys />
					<TimelineProvider name={b.name} duration={b.scene.meta.duration} timeline={b.timeline}>
						<Shell />
					</TimelineProvider>
				</PlaybackProvider>
			)}
		</Show>
	);
};

export function App() {
	return (
		<ProjectProvider>
			<Root />
		</ProjectProvider>
	);
}
