const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

const writeAscii = (view: DataView, offset: number, text: string): void => {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
};

export const floatPcmToWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
	const dataBytes = samples.length * BYTES_PER_SAMPLE;
	const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(view, 8, "WAVE");

	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, NUM_CHANNELS, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * NUM_CHANNELS * BYTES_PER_SAMPLE, true);
	view.setUint16(32, NUM_CHANNELS * BYTES_PER_SAMPLE, true);
	view.setUint16(34, BITS_PER_SAMPLE, true);

	writeAscii(view, 36, "data");
	view.setUint32(40, dataBytes, true);

	let offset = WAV_HEADER_BYTES;
	for (let i = 0; i < samples.length; i++) {
		const s = samples[i] ?? 0;
		const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
		const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
		view.setInt16(offset, int16, true);
		offset += BYTES_PER_SAMPLE;
	}

	return buffer;
};
