export type AudioBufferLike = {
	numberOfChannels: number;
	sampleRate: number;
	length: number;
	getChannelData: (channel: number) => Float32Array;
};

export type Peaks = {
	min: Float32Array;
	max: Float32Array;
	bucketCount: number;
	sampleRate: number;
};

export const computePeaks = (buffer: AudioBufferLike, bucketCount: number): Peaks => {
	if (bucketCount <= 0 || !Number.isFinite(bucketCount)) {
		throw new Error(`computePeaks: bucketCount must be a positive integer (got ${bucketCount})`);
	}
	const buckets = Math.floor(bucketCount);
	const min = new Float32Array(buckets);
	const max = new Float32Array(buckets);
	const channels = buffer.numberOfChannels;
	const length = buffer.length;

	if (length === 0 || channels === 0) {
		return { min, max, bucketCount: buckets, sampleRate: buffer.sampleRate };
	}

	const channelData: Float32Array[] = [];
	for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

	const samplesPerBucket = length / buckets;

	for (let b = 0; b < buckets; b++) {
		const startSample = Math.floor(b * samplesPerBucket);
		const endSample = b === buckets - 1 ? length : Math.floor((b + 1) * samplesPerBucket);
		let mn = Number.POSITIVE_INFINITY;
		let mx = Number.NEGATIVE_INFINITY;
		for (let i = startSample; i < endSample; i++) {
			let sum = 0;
			for (let c = 0; c < channels; c++) sum += (channelData[c] as Float32Array)[i] ?? 0;
			const v = sum / channels;
			if (v < mn) mn = v;
			if (v > mx) mx = v;
		}
		if (!Number.isFinite(mn)) mn = 0;
		if (!Number.isFinite(mx)) mx = 0;
		min[b] = mn;
		max[b] = mx;
	}

	return { min, max, bucketCount: buckets, sampleRate: buffer.sampleRate };
};
