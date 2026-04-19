import { type Accessor, createSignal } from "solid-js";

export type PlaybackState = "playing" | "paused";

export type PlaybackController = {
	time: Accessor<number>;
	state: Accessor<PlaybackState>;
	seekToken: Accessor<number>;
	play: () => void;
	pause: () => void;
	seek: (t: number) => void;
	restart: () => void;
	onTransition: (fn: () => void) => () => void;
	dispose: () => void;
};

export type PlaybackScheduler = (fn: FrameRequestCallback) => { cancel: () => void };

export type PlaybackControllerOptions = {
	duration: number;
	now?: () => number;
	scheduler?: PlaybackScheduler;
	onEnd?: "pause" | "loop";
};

const defaultScheduler: PlaybackScheduler = (fn) => {
	const handle = requestAnimationFrame(fn);
	return { cancel: () => cancelAnimationFrame(handle) };
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export const createPlaybackController = (
	options: PlaybackControllerOptions,
): PlaybackController => {
	const { duration } = options;
	const now = options.now ?? (() => performance.now());
	const scheduler = options.scheduler ?? defaultScheduler;
	const onEnd: "pause" | "loop" = options.onEnd ?? "pause";

	const [time, setTime] = createSignal(0);
	const [state, setState] = createSignal<PlaybackState>("paused");
	const [seekToken, setSeekToken] = createSignal(0);

	let anchorWall = 0;
	let anchorTime = 0;
	let frame: { cancel: () => void } | null = null;
	const listeners = new Set<() => void>();

	const notify = () => {
		for (const fn of listeners) fn();
	};

	const cancelFrame = () => {
		if (frame) {
			frame.cancel();
			frame = null;
		}
	};

	const scheduleNext = () => {
		frame = scheduler(tick);
	};

	const tick: FrameRequestCallback = () => {
		frame = null;
		if (state() !== "playing") return;
		const elapsedSec = (now() - anchorWall) / 1000;
		const raw = anchorTime + elapsedSec;
		if (raw >= duration) {
			if (onEnd === "loop" && duration > 0) {
				const looped = ((raw % duration) + duration) % duration;
				setTime(looped);
				anchorWall = now();
				anchorTime = looped;
				scheduleNext();
				return;
			}
			setTime(duration);
			setState("paused");
			notify();
			return;
		}
		setTime(clamp(raw, 0, duration));
		scheduleNext();
	};

	const anchor = (t: number) => {
		anchorWall = now();
		anchorTime = t;
	};

	const play = () => {
		if (state() === "playing") return;
		if (time() >= duration && onEnd === "pause") setTime(0);
		anchor(time());
		setState("playing");
		scheduleNext();
		notify();
	};

	const pause = () => {
		if (state() === "paused") return;
		cancelFrame();
		setState("paused");
		notify();
	};

	const seek = (t: number) => {
		const clamped = clamp(t, 0, duration);
		setTime(clamped);
		if (state() === "playing") anchor(clamped);
		setSeekToken((v) => v + 1);
		notify();
	};

	const restart = () => {
		cancelFrame();
		setTime(0);
		anchor(0);
		setState("playing");
		setSeekToken((v) => v + 1);
		scheduleNext();
		notify();
	};

	const onTransition = (fn: () => void): (() => void) => {
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	};

	const dispose = () => {
		cancelFrame();
		setState("paused");
		listeners.clear();
	};

	return { time, state, seekToken, play, pause, seek, restart, onTransition, dispose };
};
