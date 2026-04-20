import type { OverlayJSON, TimelineJSON } from "@kut-kut/engine";

export type ProjectListing = { name: string; absolutePath: string };
export type AssetRef = { path: string; size: number };
export type ProjectState = {
	name: string;
	timeline: TimelineJSON | null;
	overlay: OverlayJSON | null;
	assets: AssetRef[];
};

export class PluginError extends Error {
	readonly status: number;
	readonly body: unknown;
	constructor(status: number, body: unknown) {
		const detail =
			body && typeof body === "object" && "error" in body
				? ` — ${(body as { error: unknown }).error}`
				: "";
		super(`plugin responded ${status}${detail}`);
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

export const writeOverlay = async (name: string, overlay: OverlayJSON): Promise<void> => {
	await request(`/__kk/projects/${encodeURIComponent(name)}/overlay`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ overlay }),
	});
};

const sanitizeAssetFilename = (raw: string): string => {
	const base = raw.replace(/^.*[\\/]/, "");
	const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
	return cleaned.length > 0 ? cleaned : "asset";
};

export const uploadAsset = async (name: string, file: File): Promise<AssetRef> => {
	const form = new FormData();
	form.append("file", file, sanitizeAssetFilename(file.name));
	return (await request(`/__kk/projects/${encodeURIComponent(name)}/assets`, {
		method: "POST",
		body: form,
	})) as AssetRef;
};
