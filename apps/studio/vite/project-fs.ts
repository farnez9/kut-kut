import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { parseOverlay, parseTimeline } from "@kut-kut/engine";
import Busboy from "busboy";
import type { Connect, Plugin } from "vite";

const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const ASSET_NAME_RE = /^[A-Za-z0-9._-]+$/;

export type ProjectFsPluginOptions = {
	projectsDir?: string;
};

type RouteMatch = { name: string; rest: string };

const jsonResponse = (res: ServerResponse, status: number, body: unknown): void => {
	res.statusCode = status;
	res.setHeader("content-type", "application/json");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(body));
};

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString("utf8");
	return text.length === 0 ? null : JSON.parse(text);
};

const safeProjectPath = (projectsDir: string, name: string): string | null => {
	if (!PROJECT_NAME_RE.test(name)) return null;
	const resolved = path.resolve(projectsDir, name);
	const rel = path.relative(projectsDir, resolved);
	if (rel !== name || rel.startsWith("..") || path.isAbsolute(rel)) return null;
	return resolved;
};

const listProjectsHandler = async (res: ServerResponse, projectsDir: string): Promise<void> => {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(projectsDir, { withFileTypes: true });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			jsonResponse(res, 200, { projects: [] });
			return;
		}
		throw err;
	}
	const projects: { name: string; absolutePath: string }[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		if (!PROJECT_NAME_RE.test(entry.name)) continue;
		const abs = path.join(projectsDir, entry.name);
		try {
			await fs.access(path.join(abs, "scene.ts"));
		} catch {
			continue;
		}
		projects.push({ name: entry.name, absolutePath: abs });
	}
	projects.sort((a, b) => a.name.localeCompare(b.name));
	jsonResponse(res, 200, { projects });
};

const readProjectHandler = async (
	res: ServerResponse,
	projectsDir: string,
	name: string,
): Promise<void> => {
	const projectPath = safeProjectPath(projectsDir, name);
	if (!projectPath) {
		jsonResponse(res, 400, { error: "invalid project name" });
		return;
	}
	try {
		await fs.access(projectPath);
	} catch {
		jsonResponse(res, 404, { error: "project not found" });
		return;
	}

	let timeline: unknown = null;
	try {
		const raw = await fs.readFile(path.join(projectPath, "timeline.json"), "utf8");
		const parsed = JSON.parse(raw);
		timeline = parseTimeline(parsed);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			jsonResponse(res, 500, {
				error: "failed to read timeline.json",
				detail: (err as Error).message,
			});
			return;
		}
	}

	let overlay: unknown = null;
	try {
		const raw = await fs.readFile(path.join(projectPath, "overlay.json"), "utf8");
		const parsed = JSON.parse(raw);
		overlay = parseOverlay(parsed);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			jsonResponse(res, 500, {
				error: "failed to read overlay.json",
				detail: (err as Error).message,
			});
			return;
		}
	}

	const assetsDir = path.join(projectPath, "assets");
	const assets: { path: string; size: number }[] = [];
	try {
		const entries = await fs.readdir(assetsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (entry.name.startsWith(".")) continue;
			const stat = await fs.stat(path.join(assetsDir, entry.name));
			assets.push({ path: entry.name, size: stat.size });
		}
		assets.sort((a, b) => a.path.localeCompare(b.path));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}

	jsonResponse(res, 200, { name, timeline, overlay, assets });
};

const writeTimelineHandler = async (
	req: IncomingMessage,
	res: ServerResponse,
	projectsDir: string,
	name: string,
): Promise<void> => {
	const projectPath = safeProjectPath(projectsDir, name);
	if (!projectPath) {
		jsonResponse(res, 400, { error: "invalid project name" });
		return;
	}
	let body: unknown;
	try {
		body = await readJsonBody(req);
	} catch (err) {
		jsonResponse(res, 400, { error: "invalid json", detail: (err as Error).message });
		return;
	}
	if (body === null || typeof body !== "object" || !("timeline" in body)) {
		jsonResponse(res, 400, { error: "expected { timeline } in body" });
		return;
	}
	let validated: unknown;
	try {
		validated = parseTimeline((body as { timeline: unknown }).timeline);
	} catch (err) {
		jsonResponse(res, 400, {
			error: "timeline failed schema validation",
			detail: (err as Error).message,
		});
		return;
	}
	await fs.writeFile(
		path.join(projectPath, "timeline.json"),
		`${JSON.stringify(validated, null, "\t")}\n`,
		"utf8",
	);
	jsonResponse(res, 200, { ok: true });
};

const writeOverlayHandler = async (
	req: IncomingMessage,
	res: ServerResponse,
	projectsDir: string,
	name: string,
): Promise<void> => {
	const projectPath = safeProjectPath(projectsDir, name);
	if (!projectPath) {
		jsonResponse(res, 400, { error: "invalid project name" });
		return;
	}
	let body: unknown;
	try {
		body = await readJsonBody(req);
	} catch (err) {
		jsonResponse(res, 400, { error: "invalid json", detail: (err as Error).message });
		return;
	}
	if (body === null || typeof body !== "object" || !("overlay" in body)) {
		jsonResponse(res, 400, { error: "expected { overlay } in body" });
		return;
	}
	let validated: unknown;
	try {
		validated = parseOverlay((body as { overlay: unknown }).overlay);
	} catch (err) {
		jsonResponse(res, 400, {
			error: "overlay failed schema validation",
			detail: (err as Error).message,
		});
		return;
	}
	await fs.writeFile(
		path.join(projectPath, "overlay.json"),
		`${JSON.stringify(validated, null, "\t")}\n`,
		"utf8",
	);
	jsonResponse(res, 200, { ok: true });
};

const uploadAssetHandler = async (
	req: IncomingMessage,
	res: ServerResponse,
	projectsDir: string,
	name: string,
): Promise<void> => {
	const projectPath = safeProjectPath(projectsDir, name);
	if (!projectPath) {
		jsonResponse(res, 400, { error: "invalid project name" });
		return;
	}
	const assetsDir = path.join(projectPath, "assets");
	await fs.mkdir(assetsDir, { recursive: true });

	const busboy = Busboy({ headers: req.headers });
	let wrote = false;
	let responded = false;
	const respond = (status: number, body: unknown): void => {
		if (responded) return;
		responded = true;
		jsonResponse(res, status, body);
	};

	await new Promise<void>((resolve) => {
		busboy.on("file", (field, stream, info) => {
			if (field !== "file") {
				stream.resume();
				return;
			}
			const basename = path.basename(info.filename ?? "");
			if (!basename || !ASSET_NAME_RE.test(basename)) {
				stream.resume();
				respond(400, { error: "invalid asset filename" });
				resolve();
				return;
			}
			const targetAbs = path.resolve(assetsDir, basename);
			const rel = path.relative(assetsDir, targetAbs);
			if (rel !== basename || rel.startsWith("..")) {
				stream.resume();
				respond(400, { error: "asset path escapes project" });
				resolve();
				return;
			}
			const write = createWriteStream(targetAbs);
			stream.pipe(write);
			write.on("finish", async () => {
				wrote = true;
				try {
					const stat = await fs.stat(targetAbs);
					respond(200, { path: basename, size: stat.size });
				} catch (err) {
					respond(500, { error: "failed to stat asset", detail: (err as Error).message });
				}
				resolve();
			});
			write.on("error", (err) => {
				respond(500, { error: "failed to write asset", detail: err.message });
				resolve();
			});
		});
		busboy.on("error", (err) => {
			respond(400, { error: "invalid multipart body", detail: (err as Error).message });
			resolve();
		});
		busboy.on("close", () => {
			if (!wrote) {
				respond(400, { error: "no file field in body" });
				resolve();
			}
		});
		req.pipe(busboy);
	});
};

const matchProjectRoute = (pathname: string): RouteMatch | null => {
	const prefix = "/projects/";
	if (!pathname.startsWith(prefix)) return null;
	const rest = pathname.slice(prefix.length);
	const slash = rest.indexOf("/");
	if (slash === -1) return { name: rest, rest: "" };
	return { name: rest.slice(0, slash), rest: rest.slice(slash) };
};

const handle = async (
	req: IncomingMessage,
	res: ServerResponse,
	projectsDir: string,
): Promise<boolean> => {
	const url = new URL(req.url ?? "", "http://localhost");
	const pathname = url.pathname;
	if (!pathname.startsWith("/__kk/")) return false;
	const sub = pathname.slice("/__kk".length);

	if (sub === "/projects" && req.method === "GET") {
		await listProjectsHandler(res, projectsDir);
		return true;
	}
	const match = matchProjectRoute(sub);
	if (!match) return false;

	if (match.rest === "" && req.method === "GET") {
		await readProjectHandler(res, projectsDir, match.name);
		return true;
	}
	if (match.rest === "/timeline" && req.method === "POST") {
		await writeTimelineHandler(req, res, projectsDir, match.name);
		return true;
	}
	if (match.rest === "/overlay" && req.method === "POST") {
		await writeOverlayHandler(req, res, projectsDir, match.name);
		return true;
	}
	if (match.rest === "/assets" && req.method === "POST") {
		await uploadAssetHandler(req, res, projectsDir, match.name);
		return true;
	}
	return false;
};

export const projectFsPlugin = (options: ProjectFsPluginOptions = {}): Plugin => {
	let projectsDir = "";
	return {
		name: "kut-kut:project-fs",
		config(config) {
			const studioRoot = path.resolve(config.root ?? process.cwd());
			const workspaceRoot = path.resolve(studioRoot, "../..");
			projectsDir = options.projectsDir
				? path.resolve(options.projectsDir)
				: path.join(workspaceRoot, "projects");
			return {
				server: {
					fs: {
						allow: [workspaceRoot, projectsDir],
					},
				},
			};
		},
		configureServer(server) {
			const middleware: Connect.NextHandleFunction = (req, res, next) => {
				handle(req, res, projectsDir).then(
					(handled) => {
						if (!handled) next();
					},
					(err: Error) => {
						jsonResponse(res, 500, { error: err.message });
					},
				);
			};
			server.middlewares.use(middleware);
		},
	};
};
