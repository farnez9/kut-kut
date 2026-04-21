import { ChevronDown } from "lucide-solid";
import type { JSX } from "solid-js";
import { createEffect, createSignal, on, Show, useContext } from "solid-js";
import {
	AudioPlayerHost,
	AudioProvider,
	CleanAssetsButton,
	RecordButton,
} from "./features/audio/index.ts";
import { Inspector, InspectorHint } from "./features/inspector/index.ts";
import { LayersPanel } from "./features/layers/index.ts";
import { OverlayProvider, useOverlay } from "./features/overlay/index.ts";
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
import { RecordProvider, RecordToggle } from "./features/record/index.ts";
import { TimelineContext } from "./features/timeline/context.ts";
import {
	TimelineImportButton,
	TimelineImportError,
	TimelineProvider,
	TimelineResizer,
	TimelineView,
} from "./features/timeline/index.ts";
import { CommandProvider } from "./lib/commands/index.ts";
import { useUndoHotkeys } from "./lib/useUndoHotkeys.ts";

const INITIAL_TIMELINE_HEIGHT = 260;
const TL_COLLAPSED_HEIGHT = 44;
const LS_TL_HEIGHT = "kk:timeline:height";
const LS_TL_COLLAPSED = "kk:timeline:collapsed";

const readStoredNumber = (key: string, fallback: number): number => {
	if (typeof window === "undefined") return fallback;
	const raw = window.localStorage.getItem(key);
	if (raw === null) return fallback;
	const n = Number(raw);
	return Number.isFinite(n) ? n : fallback;
};

const readStoredBool = (key: string): boolean => {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(key) === "1";
};

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
			<div class="topbar-mid">
				<PlaybackControls />
				<RecordToggle />
			</div>
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

const KeyedPreviewHost = (): JSX.Element => {
	const overlay = useOverlay();
	return (
		<Show when={overlay.scene()} keyed>
			{(scene) => <PreviewHost scene={scene} />}
		</Show>
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
					fallback={
						<PreviewMessage
							label="No projects"
							detail="Create projects/<name>/scene.ts to get started."
						/>
					}
				>
					<KeyedPreviewHost />
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

const UndoHotkeys = (): JSX.Element => {
	useUndoHotkeys();
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

const TimelineHeaderActions = (props: {
	collapsed: boolean;
	onToggle: () => void;
}): JSX.Element => {
	const ctx = useContext(TimelineContext);
	return (
		<div class="app-timeline__actions">
			<Show when={ctx && !props.collapsed}>
				<TimelineImportButton />
				<RecordButton />
				<CleanAssetsButton />
			</Show>
			<button
				type="button"
				class="app-timeline__toggle"
				aria-label={props.collapsed ? "Expand timeline" : "Collapse timeline"}
				aria-expanded={!props.collapsed}
				title={props.collapsed ? "Expand timeline" : "Collapse timeline"}
				onClick={props.onToggle}
			>
				<span class="app-timeline__chevron" aria-hidden="true">
					<ChevronDown size={16} strokeWidth={2.25} />
				</span>
			</button>
		</div>
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

const LayersBody = (): JSX.Element => {
	const ctx = useContext(TimelineContext);
	return (
		<Show
			when={ctx}
			fallback={<p class="panel-body layers__empty">Load a project to see layers.</p>}
		>
			<LayersPanel />
		</Show>
	);
};

const Shell = (): JSX.Element => {
	const [tlHeight, setTlHeight] = createSignal(
		readStoredNumber(LS_TL_HEIGHT, INITIAL_TIMELINE_HEIGHT),
	);
	const [collapsed, setCollapsed] = createSignal(readStoredBool(LS_TL_COLLAPSED));

	const effectiveHeight = (): number => (collapsed() ? TL_COLLAPSED_HEIGHT : tlHeight());

	createEffect(
		on(
			tlHeight,
			(h) => {
				if (typeof window !== "undefined") window.localStorage.setItem(LS_TL_HEIGHT, String(h));
			},
			{ defer: true },
		),
	);
	createEffect(
		on(
			collapsed,
			(c) => {
				if (typeof window !== "undefined")
					window.localStorage.setItem(LS_TL_COLLAPSED, c ? "1" : "0");
			},
			{ defer: true },
		),
	);

	return (
		<div class="app-shell" style={{ "--tl-height": `${effectiveHeight()}px` }}>
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
				<div class="panel-head panel-head--layers">
					<span class="label">Layers</span>
					<span class="panel-head__index">02</span>
				</div>
				<LayersBody />
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

			<section class={`app-timeline ${collapsed() ? "app-timeline--collapsed" : ""}`}>
				<Show when={!collapsed()}>
					<TimelineResizer height={tlHeight} onHeight={setTlHeight} />
				</Show>
				<div class="panel-head">
					<span class="label">Timeline</span>
					<TimelineHeaderActions collapsed={collapsed()} onToggle={() => setCollapsed((v) => !v)} />
				</div>
				<Show when={!collapsed()}>
					<TimelineBody />
				</Show>
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
					<CommandProvider>
						<UndoHotkeys />
						<RecordProvider>
							<OverlayProvider name={b.name} overlay={b.overlay} factory={b.factory}>
								<TimelineProvider
									name={b.name}
									duration={b.scene.meta.duration}
									timeline={b.timeline}
								>
									<AudioProvider>
										<AudioPlayerHost />
										<Shell />
									</AudioProvider>
								</TimelineProvider>
							</OverlayProvider>
						</RecordProvider>
					</CommandProvider>
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
