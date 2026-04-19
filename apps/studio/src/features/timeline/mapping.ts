export type MappingView = { zoom: number; origin: number };

export const timeToPx = (t: number, v: MappingView): number => (t - v.origin) * v.zoom;

export const pxToTime = (px: number, v: MappingView): number => v.origin + px / v.zoom;

const TICK_CANDIDATES: readonly number[] = [0.1, 0.2, 0.5, 1, 2, 5, 10];
const LARGEST_TICK = 10;
const MIN_TICK_PX = 48;

export const pickTickStep = (pxPerSec: number): number => {
	for (const step of TICK_CANDIDATES) {
		if (step * pxPerSec >= MIN_TICK_PX) return step;
	}
	return LARGEST_TICK;
};
