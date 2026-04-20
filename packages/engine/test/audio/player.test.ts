import { beforeEach, describe, expect, test } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { createAudioPlayer } from "../../src/audio/index.ts";
import {
	createAudioClip,
	createAudioTrack,
	createPlaybackController,
	type PlaybackScheduler,
	type Track,
} from "../../src/timeline/index.ts";

type FakeSource = {
	kind: "source";
	buffer: AudioBuffer | null;
	started: Array<{ when: number; offset: number }>;
	stopped: Array<number>;
	connects: AudioNode[];
	disconnected: boolean;
	start: (when: number, offset: number) => void;
	stop: (when?: number) => void;
	connect: (node: AudioNode) => void;
	disconnect: () => void;
};

type FakeGain = {
	kind: "gain";
	gain: { value: number };
	connects: AudioNode[];
	disconnected: boolean;
	connect: (node: AudioNode) => void;
	disconnect: () => void;
};

type FakeContext = {
	currentTime: number;
	destination: { kind: "destination"; label: string };
	createdSources: FakeSource[];
	createdGains: FakeGain[];
	createBufferSource: () => FakeSource;
	createGain: () => FakeGain;
};

const makeFakeContext = (): FakeContext => {
	const ctx: FakeContext = {
		currentTime: 10,
		destination: { kind: "destination", label: "dest" },
		createdSources: [],
		createdGains: [],
		createBufferSource: () => {
			const src: FakeSource = {
				kind: "source",
				buffer: null,
				started: [],
				stopped: [],
				connects: [],
				disconnected: false,
				start: (when, offset) => {
					src.started.push({ when, offset });
				},
				stop: (when) => {
					src.stopped.push(when ?? ctx.currentTime);
				},
				connect: (node) => {
					src.connects.push(node);
				},
				disconnect: () => {
					src.disconnected = true;
				},
			};
			ctx.createdSources.push(src);
			return src;
		},
		createGain: () => {
			const g: FakeGain = {
				kind: "gain",
				gain: { value: 1 },
				connects: [],
				disconnected: false,
				connect: (node) => {
					g.connects.push(node);
				},
				disconnect: () => {
					g.disconnected = true;
				},
			};
			ctx.createdGains.push(g);
			return g;
		},
	};
	return ctx;
};

const fakeBuffer = (id: string): AudioBuffer =>
	({ _id: id, duration: 100, length: 4800000, sampleRate: 48000 }) as unknown as AudioBuffer;

type Harness = {
	now: () => number;
	advance: (ms: number) => void;
	scheduler: PlaybackScheduler;
	runFrame: () => boolean;
};

const createHarness = (): Harness => {
	let current = 0;
	const queue: FrameRequestCallback[] = [];
	const scheduler: PlaybackScheduler = (fn) => {
		queue.push(fn);
		return {
			cancel: () => {
				const idx = queue.indexOf(fn);
				if (idx !== -1) queue.splice(idx, 1);
			},
		};
	};
	return {
		now: () => current,
		advance: (ms) => {
			current += ms;
		},
		scheduler,
		runFrame: () => {
			const fn = queue.shift();
			if (!fn) return false;
			fn(current);
			return true;
		},
	};
};

describe("createAudioPlayer", () => {
	let h: Harness;
	let ctx: FakeContext;

	beforeEach(() => {
		h = createHarness();
		ctx = makeFakeContext();
	});

	test("schedules no sources while paused", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 5 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			expect(ctx.createdSources.length).toBe(0);
			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("play at t=0 schedules a source per covering clip", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T1",
					clips: [
						createAudioClip({ src: "a.mp3", start: 0, end: 3, offset: 0.5 }),
						createAudioClip({ src: "a.mp3", start: 5, end: 7 }),
					],
				}),
				createAudioTrack({
					id: "T2",
					clips: [createAudioClip({ src: "b.mp3", start: 0, end: 2 })],
				}),
			]);
			const [buffers] = createSignal(
				new Map([
					["a.mp3", fakeBuffer("a")],
					["b.mp3", fakeBuffer("b")],
				]),
			);
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});

			playback.play();
			// Two sources scheduled: T1's first clip and T2's only clip. T1's second clip starts at t=5.
			expect(ctx.createdSources.length).toBe(2);
			const [s1, s2] = ctx.createdSources;
			expect(s1?.started[0]?.offset).toBeCloseTo(0.5, 6);
			expect(s1?.stopped[0]).toBeCloseTo(ctx.currentTime + 3, 6);
			expect(s2?.started[0]?.offset).toBeCloseTo(0, 6);
			expect(s2?.stopped[0]).toBeCloseTo(ctx.currentTime + 2, 6);

			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("pause stops scheduled sources", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 5 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			expect(ctx.createdSources.length).toBe(1);
			playback.pause();
			expect(ctx.createdSources[0]?.stopped.length ?? 0).toBeGreaterThan(0);
			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("seek during playback stops old sources and rebuilds at new time", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 6, offset: 0 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			expect(ctx.createdSources.length).toBe(1);
			playback.seek(2);
			expect(ctx.createdSources.length).toBe(2);
			const second = ctx.createdSources[1];
			expect(second?.started[0]?.offset).toBeCloseTo(2, 6);
			expect(second?.stopped[0]).toBeCloseTo(ctx.currentTime + 4, 6);
			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("muted track contributes no source but the gain node is kept at 0", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					muted: true,
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 3 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			expect(ctx.createdSources.length).toBe(0);
			const trackGain = ctx.createdGains[0];
			expect(trackGain?.gain.value).toBe(0);
			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("missing buffer for a clip skips without throwing", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					clips: [
						createAudioClip({ src: "loaded.mp3", start: 0, end: 2 }),
						createAudioClip({ src: "missing.mp3", start: 0, end: 2 }),
					],
				}),
			]);
			const [buffers] = createSignal(new Map([["loaded.mp3", fakeBuffer("loaded")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			expect(ctx.createdSources.length).toBe(1);
			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("dispose stops sources and silences the effect", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 5 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			expect(ctx.createdSources.length).toBe(1);
			player.dispose();
			const beforeSeek = ctx.createdSources.length;
			playback.seek(1);
			// No further sources should be created once the player is disposed.
			expect(ctx.createdSources.length).toBe(beforeSeek);
			playback.dispose();
			dispose();
		}));

	test("reconcile() after a non-transition mute rebuilds the schedule", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks, setTracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 4 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			expect(ctx.createdSources.length).toBe(1);
			const firstSource = ctx.createdSources[0];

			const current = tracks()[0];
			if (current === undefined || current.kind !== "audio") throw new Error("track");
			setTracks([{ ...current, muted: true }]);
			player.reconcile();

			expect(firstSource?.stopped.length ?? 0).toBeGreaterThan(0);
			expect(ctx.createdSources.length).toBe(1);
			const trackGain = ctx.createdGains[0];
			expect(trackGain?.gain.value).toBe(0);

			player.dispose();
			playback.dispose();
			dispose();
		}));

	test("applies track gain to the track gain node", () =>
		createRoot((dispose) => {
			const playback = createPlaybackController({
				duration: 10,
				now: h.now,
				scheduler: h.scheduler,
			});
			const [tracks] = createSignal<Track[]>([
				createAudioTrack({
					id: "T",
					gain: 0.4,
					clips: [createAudioClip({ src: "a.mp3", start: 0, end: 3, gain: 0.5 })],
				}),
			]);
			const [buffers] = createSignal(new Map([["a.mp3", fakeBuffer("a")]]));
			const player = createAudioPlayer({
				context: ctx as unknown as AudioContext,
				tracks,
				buffers,
				playback,
			});
			playback.play();
			// First-created gain is the track gain; second is the clip gain.
			expect(ctx.createdGains[0]?.gain.value).toBeCloseTo(0.4, 6);
			expect(ctx.createdGains[1]?.gain.value).toBeCloseTo(0.5, 6);
			player.dispose();
			playback.dispose();
			dispose();
		}));
});
