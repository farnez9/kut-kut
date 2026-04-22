import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AudioBufferLike } from "../../src/audio/index.ts";
import { mixTimelineAudio } from "../../src/export/mix.ts";
import { createAudioClip, createAudioTrack, type Track } from "../../src/timeline/index.ts";

type FakeSource = {
	kind: "source";
	buffer: AudioBufferLike | null;
	started: Array<{ when: number; offset: number; duration: number | undefined }>;
	connects: FakeNode[];
	connect: (node: FakeNode) => void;
	disconnect: () => void;
	start: (when?: number, offset?: number, duration?: number) => void;
	stop: (when?: number) => void;
};

type FakeGain = {
	kind: "gain";
	gain: { value: number };
	connects: FakeNode[];
	connect: (node: FakeNode) => void;
	disconnect: () => void;
};

type FakeDestination = { kind: "destination" };
type FakeNode = FakeSource | FakeGain | FakeDestination;

type FakeOfflineContext = {
	channels: number;
	length: number;
	sampleRate: number;
	destination: FakeDestination;
	createdSources: FakeSource[];
	createdGains: FakeGain[];
	startRenderingCalls: number;
	createBufferSource: () => FakeSource;
	createGain: () => FakeGain;
	startRendering: () => Promise<AudioBufferLike>;
};

const makeFakeBuffer = (id: string, duration: number): AudioBufferLike => ({
	numberOfChannels: 2,
	sampleRate: 48000,
	length: Math.round(duration * 48000),
	getChannelData: () => new Float32Array(0),
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	...({ _id: id, duration } as any),
});

let created: FakeOfflineContext[] = [];

const installFakeOfflineContext = (): void => {
	const Ctor = function FakeOfflineAudioContext(
		this: FakeOfflineContext,
		channels: number,
		length: number,
		sampleRate: number,
	): void {
		this.channels = channels;
		this.length = length;
		this.sampleRate = sampleRate;
		this.destination = { kind: "destination" };
		this.createdSources = [];
		this.createdGains = [];
		this.startRenderingCalls = 0;
		this.createBufferSource = () => {
			const src: FakeSource = {
				kind: "source",
				buffer: null,
				started: [],
				connects: [],
				connect: (node) => {
					src.connects.push(node);
				},
				disconnect: () => {},
				start: (when, offset, duration) => {
					src.started.push({
						when: when ?? 0,
						offset: offset ?? 0,
						duration: duration,
					});
				},
				stop: () => {},
			};
			this.createdSources.push(src);
			return src;
		};
		this.createGain = () => {
			const g: FakeGain = {
				kind: "gain",
				gain: { value: 1 },
				connects: [],
				connect: (node) => {
					g.connects.push(node);
				},
				disconnect: () => {},
			};
			this.createdGains.push(g);
			return g;
		};
		this.startRendering = async () => {
			this.startRenderingCalls += 1;
			return makeFakeBuffer("rendered", this.length / this.sampleRate);
		};
		created.push(this);
	} as unknown as new (
		c: number,
		l: number,
		s: number,
	) => OfflineAudioContext;
	(globalThis as unknown as { OfflineAudioContext: typeof Ctor }).OfflineAudioContext = Ctor;
};

describe("mixTimelineAudio", () => {
	beforeEach(() => {
		created = [];
		installFakeOfflineContext();
	});

	afterEach(() => {
		(globalThis as unknown as { OfflineAudioContext?: unknown }).OfflineAudioContext = undefined;
	});

	test("schedules one source per covering clip across multiple tracks with correct offset/duration", async () => {
		const buffers = new Map<string, AudioBufferLike>([
			["a.mp3", makeFakeBuffer("a", 10)],
			["b.mp3", makeFakeBuffer("b", 10)],
		]);
		const tracks: Track[] = [
			createAudioTrack({
				id: "T1",
				clips: [
					createAudioClip({ src: "a.mp3", start: 0, end: 3, offset: 0.5 }),
					createAudioClip({ src: "a.mp3", start: 5, end: 7 }),
				],
			}),
			createAudioTrack({
				id: "T2",
				clips: [createAudioClip({ src: "b.mp3", start: 1, end: 4 })],
			}),
		];

		await mixTimelineAudio({ tracks, buffers, duration: 8, sampleRate: 48000 });

		const ctx = created[0];
		if (!ctx) throw new Error("no ctx");
		expect(ctx.channels).toBe(2);
		expect(ctx.sampleRate).toBe(48000);
		expect(ctx.startRenderingCalls).toBe(1);
		expect(ctx.createdSources.length).toBe(3);

		const [s1, s2, s3] = ctx.createdSources;
		expect(s1?.started[0]).toMatchObject({ when: 0, offset: 0.5 });
		expect(s1?.started[0]?.duration).toBeCloseTo(3, 6);
		expect(s2?.started[0]).toMatchObject({ when: 5, offset: 0 });
		expect(s2?.started[0]?.duration).toBeCloseTo(2, 6);
		expect(s3?.started[0]).toMatchObject({ when: 1, offset: 0 });
		expect(s3?.started[0]?.duration).toBeCloseTo(3, 6);
	});

	test("track and clip gain propagate to the respective GainNodes", async () => {
		const buffers = new Map<string, AudioBufferLike>([["a.mp3", makeFakeBuffer("a", 5)]]);
		const tracks: Track[] = [
			createAudioTrack({
				id: "T",
				gain: 0.4,
				clips: [createAudioClip({ src: "a.mp3", start: 0, end: 2, gain: 0.6 })],
			}),
		];

		await mixTimelineAudio({ tracks, buffers, duration: 2, sampleRate: 48000 });

		const ctx = created[0];
		if (!ctx) throw new Error("no ctx");
		// First-created gain is the track gain; second is the clip gain.
		expect(ctx.createdGains[0]?.gain.value).toBeCloseTo(0.4, 6);
		expect(ctx.createdGains[1]?.gain.value).toBeCloseTo(0.6, 6);
	});

	test("muted track and muted clip contribute no sources", async () => {
		const buffers = new Map<string, AudioBufferLike>([
			["a.mp3", makeFakeBuffer("a", 5)],
			["b.mp3", makeFakeBuffer("b", 5)],
		]);
		const tracks: Track[] = [
			createAudioTrack({
				id: "mutedTrack",
				muted: true,
				clips: [createAudioClip({ src: "a.mp3", start: 0, end: 2 })],
			}),
			createAudioTrack({
				id: "mixedTrack",
				clips: [
					createAudioClip({ src: "a.mp3", start: 0, end: 1, muted: true }),
					createAudioClip({ src: "b.mp3", start: 1, end: 2 }),
				],
			}),
		];

		await mixTimelineAudio({ tracks, buffers, duration: 2, sampleRate: 48000 });

		const ctx = created[0];
		if (!ctx) throw new Error("no ctx");
		expect(ctx.createdSources.length).toBe(1);
	});

	test("clip that starts before zero trims and advances offset by the same amount", async () => {
		const buffers = new Map<string, AudioBufferLike>([["a.mp3", makeFakeBuffer("a", 10)]]);
		const tracks: Track[] = [
			createAudioTrack({
				id: "T",
				clips: [createAudioClip({ src: "a.mp3", start: -1, end: 2, offset: 0 })],
			}),
		];

		await mixTimelineAudio({ tracks, buffers, duration: 2, sampleRate: 48000 });

		const ctx = created[0];
		if (!ctx) throw new Error("no ctx");
		const s = ctx.createdSources[0];
		expect(s?.started[0]).toMatchObject({ when: 0, offset: 1 });
		expect(s?.started[0]?.duration).toBeCloseTo(2, 6);
	});

	test("clip past duration is clamped to duration", async () => {
		const buffers = new Map<string, AudioBufferLike>([["a.mp3", makeFakeBuffer("a", 10)]]);
		const tracks: Track[] = [
			createAudioTrack({
				id: "T",
				clips: [createAudioClip({ src: "a.mp3", start: 1, end: 100 })],
			}),
		];

		await mixTimelineAudio({ tracks, buffers, duration: 3, sampleRate: 48000 });

		const ctx = created[0];
		if (!ctx) throw new Error("no ctx");
		const s = ctx.createdSources[0];
		expect(s?.started[0]?.duration).toBeCloseTo(2, 6);
	});

	test("missing buffer is skipped without throwing", async () => {
		const buffers = new Map<string, AudioBufferLike>([["loaded.mp3", makeFakeBuffer("a", 5)]]);
		const tracks: Track[] = [
			createAudioTrack({
				id: "T",
				clips: [
					createAudioClip({ src: "loaded.mp3", start: 0, end: 1 }),
					createAudioClip({ src: "missing.mp3", start: 1, end: 2 }),
				],
			}),
		];

		await mixTimelineAudio({ tracks, buffers, duration: 2, sampleRate: 48000 });

		const ctx = created[0];
		if (!ctx) throw new Error("no ctx");
		expect(ctx.createdSources.length).toBe(1);
	});
});
