export { extensionForMime } from "../mime.ts";

const pad = (n: number, width = 2): string => n.toString().padStart(width, "0");

export const makeTtsFilename = (now: Date, provider: string, ext: string): string => {
	const stamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join("");
	const safeProvider = provider.replace(/[^a-z0-9]+/gi, "").toLowerCase() || "tts";
	return `tts-${safeProvider}-${stamp}.${ext}`;
};
