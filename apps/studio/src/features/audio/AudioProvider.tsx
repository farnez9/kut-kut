import {
	computePeaks,
	createAudioClip,
	createAudioTrack,
	decodeAudio,
	isAudioTrack,
	type Peaks,
} from "@kut-kut/engine";
import { createEffect, createSignal, type JSX, on, onCleanup } from "solid-js";
import { pruneAssets, uploadAsset } from "../../lib/plugin-client.ts";
import { usePlayback } from "../playback/index.ts";
import { useProject } from "../project/context.ts";
import { useTimeline } from "../timeline/context.ts";
import { computeDecodeWorkList } from "./computeDecodeWorkList.ts";
import {
	type AudioContextValue,
	AudioContext as AudioCtx,
	type CleanState,
	type DecodeState,
	type RecordState,
} from "./context.ts";
import { extensionForMime, makeRecordingFilename, pickRecordingMime } from "./recording.ts";

export type AudioProviderProps = { children: JSX.Element };

const PEAK_BUCKETS = 800;

const makeCtor = (): typeof window.AudioContext => {
	const w = window as unknown as {
		AudioContext: typeof window.AudioContext;
		webkitAudioContext?: typeof window.AudioContext;
	};
	return w.AudioContext ?? w.webkitAudioContext ?? window.AudioContext;
};

const hasGetUserMedia = (): boolean =>
	typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export const AudioProvider = (props: AudioProviderProps): JSX.Element => {
	const project = useProject();
	const timeline = useTimeline();
	const playback = usePlayback();

	const [buffers, setBuffers] = createSignal<Map<string, AudioBuffer>>(new Map());
	const [peaks, setPeaks] = createSignal<Map<string, Peaks>>(new Map());
	const [decodeState, setDecodeState] = createSignal<Map<string, DecodeState>>(new Map());
	const [ctx, setCtx] = createSignal<AudioContext | null>(null);
	const [importState, setImportState] = createSignal<"idle" | "importing" | "error">("idle");
	const [importError, setImportError] = createSignal<Error | null>(null);
	const [recordState, setRecordState] = createSignal<RecordState>("idle");
	const [recordError, setRecordError] = createSignal<Error | null>(null);
	const [recordElapsed, setRecordElapsed] = createSignal(0);
	const [cleanState, setCleanState] = createSignal<CleanState>("idle");
	const [cleanMessage, setCleanMessage] = createSignal("");
	let cleanTimer: ReturnType<typeof setTimeout> | null = null;

	const CLEAN_MESSAGE_TTL_MS = 4000;

	const flashClean = (text: string, next: CleanState): void => {
		if (cleanTimer !== null) clearTimeout(cleanTimer);
		setCleanMessage(text);
		setCleanState(next);
		cleanTimer = setTimeout(() => {
			setCleanMessage("");
			setCleanState("idle");
			cleanTimer = null;
		}, CLEAN_MESSAGE_TTL_MS);
	};

	const cleanAssets = async (): Promise<void> => {
		if (cleanState() === "working") return;
		const name = project.bundle()?.name;
		if (!name) return;
		const keep: string[] = [];
		for (const track of timeline.timeline.tracks) {
			if (!isAudioTrack(track)) continue;
			for (const clip of track.clips) keep.push(clip.src);
		}
		if (cleanTimer !== null) {
			clearTimeout(cleanTimer);
			cleanTimer = null;
		}
		setCleanMessage("");
		setCleanState("working");
		try {
			const { deleted } = await pruneAssets(name, keep);
			if (deleted.length === 0) flashClean("No unused assets", "done");
			else
				flashClean(
					`Removed ${deleted.length} unused file${deleted.length === 1 ? "" : "s"}`,
					"done",
				);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			flashClean(`Clean failed — ${detail}`, "error");
		}
	};

	const recordSupported = (): boolean => hasGetUserMedia() && pickRecordingMime() !== null;

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

	const ingestAudioFile = async (file: File, startAt: number): Promise<void> => {
		const name = project.bundle()?.name;
		if (!name) throw new Error("no active project");
		ensureContext();
		const { path } = await uploadAsset(name, file);
		const abs = absolutePath();
		if (!abs) throw new Error("no active project");
		setStateFor(path, "pending");
		try {
			const res = await fetch(`/@fs/${abs}/${path}`);
			if (!res.ok) throw new Error(`fetch ${path} → ${res.status}`);
			const bytes = await res.arrayBuffer();
			const buffer = await decodeBytes(path, bytes);
			const track = createAudioTrack({
				clips: [createAudioClip({ src: path, start: startAt, end: startAt + buffer.duration })],
			});
			timeline.addAudioTrack(track);
		} catch (err) {
			setStateFor(path, "error");
			throw err;
		}
	};

	const importFile = async (file: File): Promise<void> => {
		setImportState("importing");
		setImportError(null);
		try {
			await ingestAudioFile(file, 0);
			setImportState("idle");
		} catch (err) {
			const e = err instanceof Error ? err : new Error(String(err));
			setImportError(e);
			setImportState("error");
			throw e;
		}
	};

	let mediaStream: MediaStream | null = null;
	let mediaRecorder: MediaRecorder | null = null;
	let recordChunks: Blob[] = [];
	let recordMime = "";
	let recordStartAt = 0;
	let recordTimer: ReturnType<typeof setInterval> | null = null;
	let recordStartedAt = 0;
	let resolveStop: ((value: Blob) => void) | null = null;
	let rejectStop: ((reason: Error) => void) | null = null;

	const stopStreamTracks = (): void => {
		if (mediaStream) {
			for (const track of mediaStream.getTracks()) track.stop();
			mediaStream = null;
		}
	};

	const stopTimer = (): void => {
		if (recordTimer !== null) {
			clearInterval(recordTimer);
			recordTimer = null;
		}
	};

	const resetRecordRefs = (): void => {
		if (mediaRecorder) {
			mediaRecorder.ondataavailable = null;
			mediaRecorder.onstop = null;
			mediaRecorder.onerror = null;
		}
		mediaRecorder = null;
		recordChunks = [];
		resolveStop = null;
		rejectStop = null;
		stopStreamTracks();
		stopTimer();
	};

	const startRecording = async (): Promise<void> => {
		if (recordState() === "recording" || recordState() === "requesting") return;
		setRecordError(null);
		if (!recordSupported()) {
			const e = new Error("Recording is not supported in this browser");
			setRecordError(e);
			setRecordState("error");
			throw e;
		}
		const mime = pickRecordingMime();
		if (!mime) {
			const e = new Error("No supported audio recording format");
			setRecordError(e);
			setRecordState("error");
			throw e;
		}
		setRecordState("requesting");
		setRecordElapsed(0);
		try {
			ensureContext();
			recordStartAt = playback.time();
			recordMime = mime;
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
				},
			});
			mediaStream = stream;
			recordChunks = [];
			const recorder = new MediaRecorder(stream, { mimeType: mime });
			mediaRecorder = recorder;
			recorder.ondataavailable = (e: BlobEvent) => {
				if (e.data && e.data.size > 0) recordChunks.push(e.data);
			};
			recorder.onstop = () => {
				const blob = new Blob(recordChunks, { type: mime });
				const resolve = resolveStop;
				resolveStop = null;
				rejectStop = null;
				resolve?.(blob);
			};
			recorder.onerror = (e: Event) => {
				const err = new Error(`MediaRecorder error: ${(e as ErrorEvent).message ?? "unknown"}`);
				const reject = rejectStop;
				resolveStop = null;
				rejectStop = null;
				reject?.(err);
			};
			recorder.start();
			recordStartedAt = performance.now();
			recordTimer = setInterval(() => {
				setRecordElapsed((performance.now() - recordStartedAt) / 1000);
			}, 100);
			setRecordState("recording");
			if (playback.state() !== "playing") playback.play();
		} catch (err) {
			resetRecordRefs();
			const e = err instanceof Error ? err : new Error(String(err));
			setRecordError(e);
			setRecordState("error");
			throw e;
		}
	};

	const stopRecording = async (): Promise<void> => {
		if (recordState() !== "recording") return;
		const recorder = mediaRecorder;
		if (!recorder) return;
		setRecordState("processing");
		stopTimer();
		const startAt = recordStartAt;
		const mime = recordMime;
		try {
			const blob = await new Promise<Blob>((resolve, reject) => {
				resolveStop = resolve;
				rejectStop = reject;
				recorder.stop();
			});
			if (playback.state() === "playing") playback.pause();
			stopStreamTracks();
			mediaRecorder = null;
			recordChunks = [];
			const ext = extensionForMime(mime);
			const filename = makeRecordingFilename(new Date(), ext);
			const file = new File([blob], filename, { type: mime });
			await ingestAudioFile(file, startAt);
			setRecordState("idle");
		} catch (err) {
			resetRecordRefs();
			const e = err instanceof Error ? err : new Error(String(err));
			setRecordError(e);
			setRecordState("error");
			throw e;
		}
	};

	const cancelRecording = (): void => {
		const recorder = mediaRecorder;
		if (recorder && recorder.state !== "inactive") {
			recorder.ondataavailable = null;
			recorder.onstop = null;
			recorder.onerror = null;
			try {
				recorder.stop();
			} catch {}
		}
		if (playback.state() === "playing") playback.pause();
		resetRecordRefs();
		setRecordElapsed(0);
		setRecordError(null);
		setRecordState("idle");
	};

	onCleanup(() => {
		cancelRecording();
		if (cleanTimer !== null) {
			clearTimeout(cleanTimer);
			cleanTimer = null;
		}
		const c = ctx();
		if (c && c.state !== "closed") c.close().catch(() => {});
	});

	const value: AudioContextValue = {
		buffers,
		peaks,
		decodeState,
		importFile,
		ingestAudioFile,
		importState,
		importError,
		recordSupported,
		recordState,
		recordError,
		recordElapsed,
		startRecording,
		stopRecording,
		cancelRecording,
		cleanState,
		cleanMessage,
		cleanAssets,
		context: ctx,
		ensureContext,
	};

	return <AudioCtx.Provider value={value}>{props.children}</AudioCtx.Provider>;
};
