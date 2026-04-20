import { isAudioTrack, type Track } from "@kut-kut/engine";

export const computeDecodeWorkList = (
	tracks: readonly Track[],
	decoded: ReadonlySet<string>,
	pending: ReadonlySet<string>,
): string[] => {
	const seen = new Set<string>();
	const work: string[] = [];
	for (const track of tracks) {
		if (!isAudioTrack(track)) continue;
		for (const clip of track.clips) {
			const src = clip.src;
			if (seen.has(src)) continue;
			seen.add(src);
			if (decoded.has(src)) continue;
			if (pending.has(src)) continue;
			work.push(src);
		}
	}
	return work;
};
