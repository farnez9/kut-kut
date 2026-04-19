import { describe, expect, test } from "bun:test";
import { type AudioBufferLike, computePeaks } from "../../src/audio/peaks.ts";

const mono = (samples: number[], sampleRate = 48000): AudioBufferLike => ({
	numberOfChannels: 1,
	sampleRate,
	length: samples.length,
	getChannelData: () => Float32Array.from(samples),
});

const stereo = (left: number[], right: number[], sampleRate = 48000): AudioBufferLike => ({
	numberOfChannels: 2,
	sampleRate,
	length: left.length,
	getChannelData: (c) => Float32Array.from(c === 0 ? left : right),
});

describe("computePeaks", () => {
	test("returns bucketCount and sampleRate on the result", () => {
		const peaks = computePeaks(mono([0, 0.5, -0.25, 0]), 2);
		expect(peaks.bucketCount).toBe(2);
		expect(peaks.sampleRate).toBe(48000);
		expect(peaks.min.length).toBe(2);
		expect(peaks.max.length).toBe(2);
	});

	test("captures min/max per bucket on a synthesized sine", () => {
		const n = 1024;
		const samples: number[] = [];
		for (let i = 0; i < n; i++) samples.push(Math.sin((i / n) * Math.PI * 2));
		const peaks = computePeaks(mono(samples), 8);
		for (let b = 0; b < 8; b++) {
			const mn = peaks.min[b] ?? 0;
			const mx = peaks.max[b] ?? 0;
			expect(mn).toBeLessThanOrEqual(mx);
			expect(mn).toBeGreaterThanOrEqual(-1.0001);
			expect(mx).toBeLessThanOrEqual(1.0001);
		}
		// A sine wave across the whole buffer reaches both extremes at some point.
		const globalMin = Math.min(...Array.from(peaks.min));
		const globalMax = Math.max(...Array.from(peaks.max));
		expect(globalMin).toBeLessThan(-0.9);
		expect(globalMax).toBeGreaterThan(0.9);
	});

	test("averages channels when the buffer is stereo", () => {
		// L and R perfectly cancel → mixed-down peaks are zero.
		const left = [1, -1, 1, -1];
		const right = [-1, 1, -1, 1];
		const peaks = computePeaks(stereo(left, right), 2);
		expect(Array.from(peaks.min)).toEqual([0, 0]);
		expect(Array.from(peaks.max)).toEqual([0, 0]);
	});

	test("constant signal produces equal min and max per bucket", () => {
		const peaks = computePeaks(mono([0.25, 0.25, 0.25, 0.25]), 2);
		expect(Array.from(peaks.min)).toEqual([0.25, 0.25]);
		expect(Array.from(peaks.max)).toEqual([0.25, 0.25]);
	});

	test("handles zero-length buffers as all zeros", () => {
		const peaks = computePeaks(mono([]), 4);
		expect(Array.from(peaks.min)).toEqual([0, 0, 0, 0]);
		expect(Array.from(peaks.max)).toEqual([0, 0, 0, 0]);
	});

	test("rejects non-positive bucketCount", () => {
		expect(() => computePeaks(mono([0, 0]), 0)).toThrow();
		expect(() => computePeaks(mono([0, 0]), -1)).toThrow();
		expect(() => computePeaks(mono([0, 0]), Number.NaN)).toThrow();
	});
});
