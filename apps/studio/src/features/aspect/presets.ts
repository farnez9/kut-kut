export type AspectPresetId = "landscape" | "portrait" | "square";

export type AspectPreset = {
	id: AspectPresetId;
	label: string;
	width: number;
	height: number;
};

export const ASPECT_PRESETS: readonly AspectPreset[] = [
	{ id: "landscape", label: "16:9", width: 1920, height: 1080 },
	{ id: "portrait", label: "9:16", width: 1080, height: 1920 },
	{ id: "square", label: "1:1", width: 1080, height: 1080 },
];

export const presetForSize = (width: number, height: number): AspectPresetId | null => {
	const match = ASPECT_PRESETS.find((p) => p.width === width && p.height === height);
	return match?.id ?? null;
};

export const isPortraitOrSquare = (width: number, height: number): boolean => width <= height;
