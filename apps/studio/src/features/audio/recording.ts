import { extensionForMime } from "./mime.ts";

const MIME_PREFERENCES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4;codecs=mp4a.40.2",
	"audio/mp4",
] as const;

export const pickRecordingMime = (): string | null => {
	if (typeof MediaRecorder === "undefined") return null;
	for (const mime of MIME_PREFERENCES) {
		if (MediaRecorder.isTypeSupported(mime)) return mime;
	}
	return null;
};

export { extensionForMime };

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
