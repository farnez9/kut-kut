import type { Scene, Timeline } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";
import type { ProjectListing } from "../../lib/plugin-client.ts";

export type ProjectBundle = {
	name: string;
	scene: Scene;
	timeline: Timeline;
};

export type ProjectLoadState = "idle" | "loading" | "ready" | "error";

export type ProjectContextValue = {
	available: Accessor<ProjectListing[]>;
	selected: Accessor<string | null>;
	bundle: Accessor<ProjectBundle | null>;
	state: Accessor<ProjectLoadState>;
	error: Accessor<Error | null>;
	select: (name: string) => void;
	reload: () => void;
};

export const ProjectContext = createContext<ProjectContextValue>();

export const useProject = (): ProjectContextValue => {
	const ctx = useContext(ProjectContext);
	if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
	return ctx;
};
