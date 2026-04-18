import { beforeEach, describe, expect, test } from "bun:test";
import { createPlaybackController, type PlaybackScheduler } from "../../src/timeline/playback.ts";

type Harness = {
	now: () => number;
	advance: (ms: number) => void;
	scheduler: PlaybackScheduler;
	runFrame: () => boolean;
	pendingFrames: () => number;
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
		pendingFrames: () => queue.length,
	};
};

describe("createPlaybackController", () => {
	let h: Harness;

	beforeEach(() => {
		h = createHarness();
	});

	test("initial state is paused at time 0", () => {
		const c = createPlaybackController({
			duration: 5,
			now: h.now,
			scheduler: h.scheduler,
		});
		expect(c.time()).toBe(0);
		expect(c.state()).toBe("paused");
		expect(h.pendingFrames()).toBe(0);
		c.dispose();
	});

	test("play advances time on each tick proportional to elapsed wall time", () => {
		const c = createPlaybackController({
			duration: 10,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.play();
		expect(c.state()).toBe("playing");
		expect(h.pendingFrames()).toBe(1);

		h.advance(1000);
		h.runFrame();
		expect(c.time()).toBeCloseTo(1, 10);

		h.advance(500);
		h.runFrame();
		expect(c.time()).toBeCloseTo(1.5, 10);

		c.dispose();
	});

	test("pause stops further ticks and freezes time", () => {
		const c = createPlaybackController({
			duration: 10,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.play();
		h.advance(2000);
		h.runFrame();
		expect(c.time()).toBeCloseTo(2, 10);
		c.pause();
		expect(c.state()).toBe("paused");
		expect(h.pendingFrames()).toBe(0);
		h.advance(5000);
		expect(c.time()).toBeCloseTo(2, 10);
		c.dispose();
	});

	test("seek updates time immediately and re-anchors playback", () => {
		const c = createPlaybackController({
			duration: 10,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.play();
		h.advance(1000);
		h.runFrame();
		c.seek(7);
		expect(c.time()).toBe(7);
		h.advance(500);
		h.runFrame();
		expect(c.time()).toBeCloseTo(7.5, 10);
		c.dispose();
	});

	test("seek clamps outside [0, duration]", () => {
		const c = createPlaybackController({
			duration: 5,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.seek(-3);
		expect(c.time()).toBe(0);
		c.seek(999);
		expect(c.time()).toBe(5);
		c.dispose();
	});

	test("restart seeks to 0 and resumes playing", () => {
		const c = createPlaybackController({
			duration: 10,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.seek(4);
		c.restart();
		expect(c.time()).toBe(0);
		expect(c.state()).toBe("playing");
		h.advance(1000);
		h.runFrame();
		expect(c.time()).toBeCloseTo(1, 10);
		c.dispose();
	});

	test("onEnd=pause clamps at duration and pauses", () => {
		const c = createPlaybackController({
			duration: 2,
			now: h.now,
			scheduler: h.scheduler,
			onEnd: "pause",
		});
		c.play();
		h.advance(5000);
		h.runFrame();
		expect(c.time()).toBe(2);
		expect(c.state()).toBe("paused");
		expect(h.pendingFrames()).toBe(0);
		c.dispose();
	});

	test("onEnd=loop wraps back to 0 and keeps playing", () => {
		const c = createPlaybackController({
			duration: 2,
			now: h.now,
			scheduler: h.scheduler,
			onEnd: "loop",
		});
		c.play();
		h.advance(2500);
		h.runFrame();
		expect(c.time()).toBeCloseTo(0.5, 10);
		expect(c.state()).toBe("playing");
		c.dispose();
	});

	test("dispose cancels the pending frame", () => {
		const c = createPlaybackController({
			duration: 10,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.play();
		expect(h.pendingFrames()).toBe(1);
		c.dispose();
		expect(h.pendingFrames()).toBe(0);
		expect(c.state()).toBe("paused");
	});

	test("play is drift-free over many ticks", () => {
		const c = createPlaybackController({
			duration: 100,
			now: h.now,
			scheduler: h.scheduler,
		});
		c.play();
		for (let i = 0; i < 60; i++) {
			h.advance(16.6667);
			h.runFrame();
		}
		expect(c.time()).toBeCloseTo(1.000_002, 5);
		c.dispose();
	});
});
