import { type Property, prop } from "../reactive/property.ts";
import { NodeType } from "./node-type.ts";
import type { Transform, Vec3 } from "./transform.ts";

export type Circle = {
	readonly id: string;
	readonly type: typeof NodeType.Circle;
	name: string;
	transform: Transform;
	radius: Property<number>;
	color: Property<Vec3>;
	stroke: Property<Vec3 | null>;
	strokeWidth: Property<number>;
};

export type CreateCircleOptions = {
	id?: string;
	name?: string;
	transform: Transform;
	radius?: number;
	color?: Vec3;
	stroke?: Vec3 | null;
	strokeWidth?: number;
};

export const createCircle = (options: CreateCircleOptions): Circle => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Circle,
	name: options.name ?? "Circle",
	transform: options.transform,
	radius: prop(options.radius ?? 50),
	color: prop<Vec3>(options.color ?? [1, 1, 1]),
	stroke: prop<Vec3 | null>(options.stroke ?? null),
	strokeWidth: prop(options.strokeWidth ?? 0),
});
