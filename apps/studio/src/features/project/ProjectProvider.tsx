import {
	createTimeline,
	deserializeTimeline,
	emptyOverlay,
	parseOverlay,
	type Scene,
} from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount } from "solid-js";
import { listProjects, type ProjectListing, readProject } from "../../lib/plugin-client.ts";
import {
	type ProjectBundle,
	ProjectContext,
	type ProjectContextValue,
	type ProjectLoadState,
} from "./context.ts";

export type ProjectProviderProps = { children: JSX.Element };

type SceneModule = { default: () => Scene };

type SceneHmrDetail = { url: string; module: SceneModule };

const readQueryProject = (): string | null => {
	if (typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get("project");
};

const writeQueryProject = (name: string): void => {
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	if (url.searchParams.get("project") === name) return;
	url.searchParams.set("project", name);
	window.history.replaceState(null, "", url.toString());
};

export const ProjectProvider = (props: ProjectProviderProps): JSX.Element => {
	const [available, setAvailable] = createSignal<ProjectListing[]>([]);
	const [selected, setSelected] = createSignal<string | null>(null);
	const [bundle, setBundle] = createSignal<ProjectBundle | null>(null);
	const [state, setState] = createSignal<ProjectLoadState>("idle");
	const [error, setError] = createSignal<Error | null>(null);
	const [liveFactory, setLiveFactory] = createSignal<(() => Scene) | null>(null);

	let generation = 0;

	const loadByName = async (name: string): Promise<void> => {
		const gen = ++generation;
		setState("loading");
		setError(null);
		try {
			const entry = available().find((p) => p.name === name);
			if (!entry) throw new Error(`unknown project "${name}"`);
			const [mod, projectState] = await Promise.all([
				import(/* @vite-ignore */ `/@fs/${entry.absolutePath}/scene.ts`) as Promise<SceneModule>,
				readProject(name),
			]);
			if (gen !== generation) return;
			const initialFactory = mod.default;
			setLiveFactory(() => initialFactory);
			const factoryWrapper = (): Scene => {
				const live = liveFactory();
				return (live ?? initialFactory)();
			};
			const scene = initialFactory();
			const timeline = projectState.timeline
				? deserializeTimeline(projectState.timeline)
				: createTimeline();
			const overlay = projectState.overlay ? parseOverlay(projectState.overlay) : emptyOverlay();
			setBundle({ name, scene, factory: factoryWrapper, timeline, overlay });
			setState("ready");
			writeQueryProject(name);
		} catch (err) {
			if (gen !== generation) return;
			setError(err instanceof Error ? err : new Error(String(err)));
			setBundle(null);
			setState("error");
		}
	};

	const refreshList = async (): Promise<void> => {
		const projects = await listProjects();
		setAvailable(projects);
		if (projects.length === 0) {
			setSelected(null);
			setBundle(null);
			setState("ready");
			return;
		}
		const queryName = readQueryProject();
		const pick = projects.find((p) => p.name === queryName)?.name ?? projects[0]!.name;
		setSelected(pick);
		await loadByName(pick);
	};

	onMount(() => {
		const onSceneHmr = (event: Event): void => {
			const detail = (event as CustomEvent<SceneHmrDetail>).detail;
			if (!detail?.module) return;
			const current = bundle();
			if (!current) return;
			const entry = available().find((p) => p.name === current.name);
			if (!entry) return;
			let pathname: string;
			try {
				pathname = new URL(detail.url).pathname;
			} catch {
				return;
			}
			if (!pathname.endsWith(`${entry.absolutePath}/scene.ts`)) return;
			const next = detail.module.default;
			if (typeof next !== "function") return;
			setLiveFactory(() => next);
		};
		window.addEventListener("kk:scene-hmr", onSceneHmr);
		onCleanup(() => window.removeEventListener("kk:scene-hmr", onSceneHmr));
		refreshList().catch((err) => {
			setError(err instanceof Error ? err : new Error(String(err)));
			setState("error");
		});
	});

	const value: ProjectContextValue = {
		available,
		selected,
		bundle,
		state,
		error,
		select: (name) => {
			if (name === selected()) return;
			setSelected(name);
			loadByName(name).catch(() => {});
		},
		reload: () => {
			const name = selected();
			if (name) loadByName(name).catch(() => {});
		},
	};

	return <ProjectContext.Provider value={value}>{props.children}</ProjectContext.Provider>;
};
