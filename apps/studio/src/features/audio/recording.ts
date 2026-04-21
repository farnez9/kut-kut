const MIME_PREFERENCES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4;codecs=mp4a.40.2",
	"audio/mp4",
] as const;

const EXTENSION_BY_CONTAINER: ReadonlyArray<[RegExp, string]> = [
	[/^audio\/webm/i, "webm"],
	[/^audio\/mp4/i, "m4a"],
	[/^audio\/ogg/i, "ogg"],
	[/^audio\/wav/i, "wav"],
];

export const pickRecordingMime = (): string | null => {
	if (typeof MediaRecorder === "undefined") return null;
	for (const mime of MIME_PREFERENCES) {
		if (MediaRecorder.isTypeSupported(mime)) return mime;
	}
	return null;
};

export const extensionForMime = (mime: string): string => {
	for (const [pattern, ext] of EXTENSION_BY_CONTAINER) {
		if (pattern.test(mime)) return ext;
	}
	return "bin";
};

const pad = (n: number, width = 2): string => n.toString().padStart(width, "0");

export const makeRecordingFilename = (now: Date, ext: string): string => {
	const stamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join("");
	return `voiceover-${stamp}.${ext}`;
};
