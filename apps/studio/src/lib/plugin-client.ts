import type { TimelineJSON } from "@kut-kut/engine";

export type ProjectListing = { name: string; absolutePath: string };
export type AssetRef = { path: string; size: number };
export type ProjectState = {
	name: string;
	timeline: TimelineJSON | null;
	assets: AssetRef[];
};

export class PluginError extends Error {
	readonly status: number;
	readonly body: unknown;
	constructor(status: number, body: unknown) {
		super(`plugin responded ${status}`);
		this.status = status;
		this.body = body;
	}
}

const request = async (url: string, init?: RequestInit): Promise<unknown> => {
	const res = await fetch(url, init);
	const text = await res.text();
	const body = text.length === 0 ? null : JSON.parse(text);
	if (!res.ok) throw new PluginError(res.status, body);
	return body;
};

export const listProjects = async (): Promise<ProjectListing[]> => {
	const body = (await request("/__kk/projects")) as { projects: ProjectListing[] };
	return body.projects;
};

export const readProject = async (name: string): Promise<ProjectState> => {
	return (await request(`/__kk/projects/${encodeURIComponent(name)}`)) as ProjectState;
};

export const writeTimeline = async (name: string, timeline: TimelineJSON): Promise<void> => {
	await request(`/__kk/projects/${encodeURIComponent(name)}/timeline`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ timeline }),
	});
};

export const uploadAsset = async (name: string, file: File): Promise<AssetRef> => {
	const form = new FormData();
	form.append("file", file, file.name);
	return (await request(`/__kk/projects/${encodeURIComponent(name)}/assets`, {
		method: "POST",
		body: form,
	})) as AssetRef;
};
