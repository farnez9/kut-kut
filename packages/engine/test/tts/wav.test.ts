import { describe, expect, test } from "bun:test";
import { floatPcmToWav } from "../../src/tts/wav.ts";

const ascii = (view: DataView, offset: number, length: number): string => {
	let s = "";
	for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
	return s;
};

describe("floatPcmToWav", () => {
	test("produces a canonical 44-byte RIFF/WAVE/fmt/data header", () => {
		const sampleRate = 24000;
		const samples = new Float32Array(10);
		const buffer = floatPcmToWav(samples, sampleRate);
		const view = new DataView(buffer);

		expect(ascii(view, 0, 4)).toBe("RIFF");
		expect(ascii(view, 8, 4)).toBe("WAVE");
		expect(ascii(view, 12, 4)).toBe("fmt ");
		expect(ascii(view, 36, 4)).toBe("data");

		expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
		expect(view.getUint32(16, true)).toBe(16);
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(sampleRate);
		expect(view.getUint32(28, true)).toBe(sampleRate * 2);
		expect(view.getUint16(32, true)).toBe(2);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(samples.length * 2);
	});

	test("one second of silence produces 44 + 2 * sampleRate bytes", () => {
		const sampleRate = 24000;
		const samples = new Float32Array(sampleRate);
		const buffer = floatPcmToWav(samples, sampleRate);
		expect(buffer.byteLength).toBe(44 + 2 * sampleRate);
	});

	test("clamps out-of-range samples to the 16-bit signed extremes", () => {
		const samples = new Float32Array([2, -2, 0, 1, -1]);
		const buffer = floatPcmToWav(samples, 8000);
		const view = new DataView(buffer);
		expect(view.getInt16(44, true)).toBe(32767);
		expect(view.getInt16(46, true)).toBe(-32768);
		expect(view.getInt16(48, true)).toBe(0);
		expect(view.getInt16(50, true)).toBe(32767);
		expect(view.getInt16(52, true)).toBe(-32768);
	});
});
