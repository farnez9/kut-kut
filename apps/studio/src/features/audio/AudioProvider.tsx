import {
	computePeaks,
	createAudioClip,
	createAudioTrack,
	decodeAudio,
	type Peaks,
} from "@kut-kut/engine";
import { createEffect, createSignal, type JSX, on, onCleanup } from "solid-js";
import { uploadAsset } from "../../lib/plugin-client.ts";
import { useProject } from "../project/context.ts";
import { useTimeline } from "../timeline/context.ts";
import { computeDecodeWorkList } from "./computeDecodeWorkList.ts";
import { type AudioContextValue, AudioContext as AudioCtx, type DecodeState } from "./context.ts";

export type AudioProviderProps = { children: JSX.Element };

const PEAK_BUCKETS = 800;

const makeCtor = (): typeof window.AudioContext => {
	const w = window as unknown as {
		AudioContext: typeof window.AudioContext;
		webkitAudioContext?: typeof window.AudioContext;
	};
	return w.AudioContext ?? w.webkitAudioContext ?? window.AudioContext;
};

export const AudioProvider = (props: AudioProviderProps): JSX.Element => {
	const project = useProject();
	const timeline = useTimeline();

	const [buffers, setBuffers] = createSignal<Map<string, AudioBuffer>>(new Map());
	const [peaks, setPeaks] = createSignal<Map<string, Peaks>>(new Map());
	const [decodeState, setDecodeState] = createSignal<Map<string, DecodeState>>(new Map());
	const [ctx, setCtx] = createSignal<AudioContext | null>(null);
	const [importState, setImportState] = createSignal<"idle" | "importing" | "error">("idle");
	const [importError, setImportError] = createSignal<Error | null>(null);

	const ensureContext = (): AudioContext => {
		let current = ctx();
		if (current) return current;
		const Ctor = makeCtor();
		current = new Ctor();
		setCtx(current);
		return current;
	};

	const absolutePath = (): string | null => {
		const name = project.bundle()?.name;
		if (!name) return null;
		return project.available().find((p) => p.name === name)?.absolutePath ?? null;
	};

	const setStateFor = (src: string, state: DecodeState): void => {
		setDecodeState((m) => {
			const next = new Map(m);
			next.set(src, state);
			return next;
		});
	};

	const storeBuffer = (src: string, buffer: AudioBuffer, computed: Peaks): void => {
		setBuffers((m) => {
			const next = new Map(m);
			next.set(src, buffer);
			return next;
		});
		setPeaks((m) => {
			const next = new Map(m);
			next.set(src, computed);
			return next;
		});
	};

	const decodeBytes = async (src: string, bytes: ArrayBuffer): Promise<AudioBuffer> => {
		const context = ensureContext();
		const buffer = await decodeAudio(context, bytes);
		const computed = computePeaks(buffer, PEAK_BUCKETS);
		storeBuffer(src, buffer, computed);
		setStateFor(src, "ready");
		return buffer;
	};

	const fetchAndDecode = async (src: string): Promise<void> => {
		setStateFor(src, "pending");
		try {
			const abs = absolutePath();
			if (!abs) throw new Error("no active project");
			const res = await fetch(`/@fs/${abs}/${src}`);
			if (!res.ok) throw new Error(`fetch ${src} → ${res.status}`);
			const bytes = await res.arrayBuffer();
			await decodeBytes(src, bytes);
		} catch (err) {
			setStateFor(src, "error");
			throw err;
		}
	};

	createEffect(
		on(
			() => timeline.timeline.tracks,
			() => {
				const decoded = new Set(buffers().keys());
				const pending = new Set<string>();
				for (const [src, state] of decodeState()) {
					if (state === "pending") pending.add(src);
				}
				const work = computeDecodeWorkList(timeline.timeline.tracks, decoded, pending);
				for (const src of work) {
					fetchAndDecode(src).catch((err) => {
						console.error("[audio] decode failed", src, err);
					});
				}
			},
		),
	);

	const importFile = async (file: File): Promise<void> => {
		setImportState("importing");
		setImportError(null);
		let pendingPath: string | null = null;
		try {
			const name = project.bundle()?.name;
			if (!name) throw new Error("no active project");
			ensureContext();
			const { path } = await uploadAsset(name, file);
			const abs = absolutePath();
			if (!abs) throw new Error("no active project");
			pendingPath = path;
			setStateFor(path, "pending");
			const res = await fetch(`/@fs/${abs}/${path}`);
			if (!res.ok) throw new Error(`fetch ${path} → ${res.status}`);
			const bytes = await res.arrayBuffer();
			const buffer = await decodeBytes(path, bytes);
			const track = createAudioTrack({
				clips: [createAudioClip({ src: path, start: 0, end: buffer.duration })],
			});
			timeline.addAudioTrack(track);
			setImportState("idle");
		} catch (err) {
			const e = err instanceof Error ? err : new Error(String(err));
			if (pendingPath) setStateFor(pendingPath, "error");
			setImportError(e);
			setImportState("error");
			throw e;
		}
	};

	onCleanup(() => {
		const c = ctx();
		if (c && c.state !== "closed") c.close().catch(() => {});
	});

	const value: AudioContextValue = {
		buffers,
		peaks,
		decodeState,
		importFile,
		importState,
		importError,
		context: ctx,
		ensureContext,
	};

	return <AudioCtx.Provider value={value}>{props.children}</AudioCtx.Provider>;
};
