import type { CaptionClip } from "../timeline/types.ts";

const FULL_TIMESTAMP_RE = /^(\d{1,3}):(\d{2}):(\d{2})[.,](\d{1,3})$/;
const SHORT_TIMESTAMP_RE = /^(\d{1,3}):(\d{2})[.,](\d{1,3})$/;

const stripBOM = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const normaliseLineEndings = (s: string): string => s.replace(/\r\n|\r/g, "\n");

const parseTimestamp = (raw: string): number | null => {
	const full = FULL_TIMESTAMP_RE.exec(raw);
	if (full) {
		const [, h, m, s, ms] = full;
		const frac = ms ? Number(ms.padEnd(3, "0")) / 1000 : 0;
		return Number(h) * 3600 + Number(m) * 60 + Number(s) + frac;
	}
	const short = SHORT_TIMESTAMP_RE.exec(raw);
	if (short) {
		const [, m, s, ms] = short;
		const frac = ms ? Number(ms.padEnd(3, "0")) / 1000 : 0;
		return Number(m) * 60 + Number(s) + frac;
	}
	return null;
};

const splitIntoBlocks = (text: string): string[][] => {
	const blocks: string[][] = [];
	let current: string[] = [];
	for (const line of text.split("\n")) {
		if (line.trim() === "") {
			if (current.length > 0) {
				blocks.push(current);
				current = [];
			}
		} else {
			current.push(line);
		}
	}
	if (current.length > 0) blocks.push(current);
	return blocks;
};

const parseCueBlock = (lines: string[]): CaptionClip | null => {
	let arrowIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line?.includes("-->")) {
			arrowIdx = i;
			break;
		}
	}
	if (arrowIdx === -1) return null;
	const arrowLine = lines[arrowIdx];
	if (!arrowLine) return null;
	const [startPart, endPart] = arrowLine.split(/\s*-->\s*/);
	if (!startPart || !endPart) return null;
	const start = parseTimestamp(startPart.trim());
	const endToken = endPart.trim().split(/\s+/)[0];
	const end = endToken ? parseTimestamp(endToken) : null;
	if (start === null || end === null) return null;
	const text = lines.slice(arrowIdx + 1).join("\n");
	return {
		id: crypto.randomUUID(),
		start,
		end,
		text,
	};
};

export const parseSRT = (input: string): CaptionClip[] => {
	const text = normaliseLineEndings(stripBOM(input));
	const blocks = splitIntoBlocks(text);
	const clips: CaptionClip[] = [];
	for (const block of blocks) {
		const clip = parseCueBlock(block);
		if (clip) clips.push(clip);
	}
	return clips;
};

const VTT_METADATA_PREFIXES = ["WEBVTT", "NOTE", "STYLE", "REGION"] as const;

export const parseVTT = (input: string): CaptionClip[] => {
	const text = normaliseLineEndings(stripBOM(input));
	const blocks = splitIntoBlocks(text);
	const clips: CaptionClip[] = [];
	for (const block of blocks) {
		const firstLine = block[0];
		if (!firstLine) continue;
		const head = firstLine.trim();
		if (VTT_METADATA_PREFIXES.some((p) => head === p || head.startsWith(`${p} `))) continue;
		const clip = parseCueBlock(block);
		if (clip) clips.push(clip);
	}
	return clips;
};

const pad = (value: number, width: number): string => value.toString().padStart(width, "0");

const formatTimestamp = (seconds: number, separator: "." | ","): string => {
	const clamped = Math.max(0, seconds);
	const totalMs = Math.round(clamped * 1000);
	const ms = totalMs % 1000;
	const totalSeconds = Math.floor(totalMs / 1000);
	const s = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const m = totalMinutes % 60;
	const h = Math.floor(totalMinutes / 60);
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms, 3)}`;
};

const sortedByStart = (clips: CaptionClip[]): CaptionClip[] =>
	[...clips].sort((a, b) => a.start - b.start);

export const serializeSRT = (clips: CaptionClip[]): string => {
	const sorted = sortedByStart(clips);
	const blocks = sorted.map(
		(clip, i) =>
			`${i + 1}\n${formatTimestamp(clip.start, ",")} --> ${formatTimestamp(clip.end, ",")}\n${clip.text}`,
	);
	return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
};

export const serializeVTT = (clips: CaptionClip[]): string => {
	const sorted = sortedByStart(clips);
	const blocks = sorted.map(
		(clip) =>
			`${formatTimestamp(clip.start, ".")} --> ${formatTimestamp(clip.end, ".")}\n${clip.text}`,
	);
	return blocks.length === 0 ? "WEBVTT\n" : `WEBVTT\n\n${blocks.join("\n\n")}\n`;
};
