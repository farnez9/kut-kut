export const EasingName = {
	Linear: "linear",
	EaseInQuad: "ease-in-quad",
	EaseOutQuad: "ease-out-quad",
	EaseInOutQuad: "ease-in-out-quad",
	EaseInCubic: "ease-in-cubic",
	EaseOutCubic: "ease-out-cubic",
	EaseInOutCubic: "ease-in-out-cubic",
	StepHold: "step-hold",
} as const;

export type EasingName = (typeof EasingName)[keyof typeof EasingName];

export type EasingFn = (t: number) => number;

export const easings: Record<EasingName, EasingFn> = {
	linear: (t) => t,
	"ease-in-quad": (t) => t * t,
	"ease-out-quad": (t) => 1 - (1 - t) * (1 - t),
	"ease-in-out-quad": (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
	"ease-in-cubic": (t) => t * t * t,
	"ease-out-cubic": (t) => 1 - (1 - t) ** 3,
	"ease-in-out-cubic": (t) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) ** 3),
	"step-hold": (t) => (t >= 1 ? 1 : 0),
};
