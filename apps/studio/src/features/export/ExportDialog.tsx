import {
	createCompositor,
	createPixiLayerRenderer,
	createThreeLayerRenderer,
	type ExportProgress,
	exportVideo,
	NodeType,
} from "@kut-kut/engine";
import { createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import { useAudio } from "../audio/index.ts";
import { useOverlay } from "../overlay/index.ts";
import { useProject } from "../project/index.ts";
import { useTimeline } from "../timeline/index.ts";
import { makeExportFilename } from "./filename.ts";

type ExportState = "idle" | "exporting" | "success" | "error" | "cancelled";

const hasWebCodecs = (): boolean =>
	typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined";

export const ExportDialog = (props: { onClose: () => void }): JSX.Element => {
	const project = useProject();
	const overlay = useOverlay();
	const timeline = useTimeline();
	const audio = useAudio();

	const [state, setState] = createSignal<ExportState>("idle");
	const [progress, setProgress] = createSignal<ExportProgress>({
		framesDone: 0,
		totalFrames: 0,
	});
	const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

	let controller: AbortController | null = null;
	let activeCompositor: ReturnType<typeof createCompositor> | null = null;
	let activeHost: HTMLDivElement | null = null;

	const cleanupHost = (): void => {
		if (activeCompositor) {
			activeCompositor.dispose();
			activeCompositor = null;
		}
		if (activeHost) {
			activeHost.remove();
			activeHost = null;
		}
	};

	onCleanup(() => {
		if (controller) controller.abort();
		cleanupHost();
	});

	const downloadBlob = (blob: Blob, filename: string): void => {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	};

	const startExport = async (): Promise<void> => {
		if (!hasWebCodecs()) return;
		const bundle = project.bundle();
		if (!bundle) return;
		const scene = overlay.scene();
		if (!scene) return;

		setErrorMessage(null);
		setProgress({ framesDone: 0, totalFrames: 0 });
		setState("exporting");

		const host = document.createElement("div");
		host.style.position = "fixed";
		host.style.left = "-10000px";
		host.style.top = "-10000px";
		host.style.width = `${scene.meta.width}px`;
		host.style.height = `${scene.meta.height}px`;
		host.style.pointerEvents = "none";
		document.body.appendChild(host);
		activeHost = host;

		const compositor = createCompositor({
			host,
			scene,
			createLayerRenderer: ({ layer, meta }) =>
				layer.type === NodeType.Layer2D
					? createPixiLayerRenderer({ layer, meta })
					: createThreeLayerRenderer({ layer, meta }),
		});
		activeCompositor = compositor;
		controller = new AbortController();

		try {
			await compositor.mount();
			compositor.setSize(scene.meta.width, scene.meta.height);

			const audioTracks = timeline.timeline.tracks;
			const buffers = audio.buffers();

			const blob = await exportVideo({
				scene,
				timeline: timeline.timeline,
				overlay: overlay.overlay,
				audioTracks,
				audioBuffers: buffers,
				compositor,
				signal: controller.signal,
				onProgress: (p) => setProgress(p),
			});

			downloadBlob(blob, makeExportFilename(new Date(), bundle.name));
			setState("success");
		} catch (err) {
			if (controller?.signal.aborted) {
				setState("cancelled");
			} else {
				const e = err instanceof Error ? err : new Error(String(err));
				setErrorMessage(e.message);
				setState("error");
				console.error("[export] failed", e);
			}
		} finally {
			cleanupHost();
			controller = null;
		}
	};

	const onCancel = (): void => {
		if (controller) controller.abort();
	};

	const progressPercent = (): number => {
		const { framesDone, totalFrames } = progress();
		if (totalFrames <= 0) return 0;
		return Math.min(100, Math.round((framesDone / totalFrames) * 100));
	};

	const summary = (): JSX.Element => {
		const bundle = project.bundle();
		if (!bundle) return null;
		const m = bundle.scene.meta;
		const audioTrackCount = timeline.timeline.tracks.filter((t) => t.kind === "audio").length;
		return (
			<dl class="export-panel__meta">
				<For
					each={
						[
							["Project", bundle.name],
							["Size", `${m.width}×${m.height}`],
							["FPS", `${m.fps}`],
							["Duration", `${m.duration.toFixed(1)}s`],
							["Audio tracks", `${audioTrackCount}`],
						] as Array<[string, string]>
					}
				>
					{([k, v]) => (
						<div class="export-panel__meta-row">
							<dt>{k}</dt>
							<dd>{v}</dd>
						</div>
					)}
				</For>
			</dl>
		);
	};

	return (
		<div class="export-panel" role="dialog" aria-label="Export video">
			<div class="export-panel__header">
				<span class="export-panel__title">Export</span>
				<button
					type="button"
					class="export-panel__close"
					onClick={() => {
						if (controller) controller.abort();
						props.onClose();
					}}
					aria-label="Close export panel"
				>
					×
				</button>
			</div>

			{summary()}

			<Show
				when={hasWebCodecs()}
				fallback={
					<div class="export-panel__banner" role="status">
						WebCodecs is not available in this browser. Export requires Chromium-based browsers
						(Chrome, Edge, Arc) with `VideoEncoder` and `AudioEncoder` APIs.
					</div>
				}
			>
				<div class="export-panel__actions">
					<button
						type="button"
						class="tl-import-btn export-panel__start"
						onClick={startExport}
						disabled={state() === "exporting" || !project.bundle()}
					>
						{state() === "exporting" ? "Exporting…" : "Start"}
					</button>
					<Show when={state() === "exporting"}>
						<button type="button" class="tl-import-btn" onClick={onCancel}>
							Cancel
						</button>
					</Show>
				</div>

				<Show when={state() === "exporting" || progress().totalFrames > 0}>
					<div class="export-panel__progress" role="status" aria-live="polite">
						<div class="export-panel__progress-label">
							<span>{state() === "exporting" ? "Encoding…" : "Last run"}</span>
							<span>
								{progress().framesDone} / {progress().totalFrames} frames · {progressPercent()}%
							</span>
						</div>
						<div class="export-panel__progress-bar">
							<div class="export-panel__progress-fill" style={{ width: `${progressPercent()}%` }} />
						</div>
					</div>
				</Show>

				<Show when={state() === "success"}>
					<div class="export-panel__notice export-panel__notice--ok" role="status">
						Export complete — download started.
					</div>
				</Show>
				<Show when={state() === "cancelled"}>
					<div class="export-panel__notice" role="status">
						Export cancelled.
					</div>
				</Show>
				<Show when={state() === "error" && errorMessage()}>
					<div class="export-panel__notice export-panel__notice--error" role="status">
						Export failed — {errorMessage()}
					</div>
				</Show>
			</Show>
		</div>
	);
};
