import type { Node } from "../scene/node.ts";
import type { Vec3 } from "../scene/transform.ts";
import type { Property } from "./property.ts";

const isProperty = (value: unknown): value is Property<unknown> => {
	if (value === null || typeof value !== "object") return false;
	const maybe = value as { get?: unknown; set?: unknown };
	return typeof maybe.get === "function" && typeof maybe.set === "function";
};

export const resolveProperty = (node: Node, path: string): Property<unknown> | undefined => {
	const segments = path.split(".");
	let current: unknown = node;
	for (const segment of segments) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[segment];
		if (current === undefined) return undefined;
	}
	return isProperty(current) ? current : undefined;
};

export const isNumberProperty = (p: Property<unknown>): p is Property<number> & Property<unknown> =>
	typeof p.initial === "number";

export const isVec3Property = (p: Property<unknown>): p is Property<Vec3> & Property<unknown> =>
	Array.isArray(p.initial) &&
	p.initial.length === 3 &&
	p.initial.every((v) => typeof v === "number");
