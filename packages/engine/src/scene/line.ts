import { type Property, prop } from "../reactive/property.ts";
import { NodeType } from "./node-type.ts";
import type { Transform, Vec3 } from "./transform.ts";

export type Line = {
	readonly id: string;
	readonly type: typeof NodeType.Line;
	name: string;
	transform: Transform;
	points: Property<Vec3[]>;
	color: Property<Vec3>;
	width: Property<number>;
};

export type CreateLineOptions = {
	id?: string;
	name?: string;
	transform: Transform;
	points?: Vec3[];
	color?: Vec3;
	width?: number;
};

export const createLine = (options: CreateLineOptions): Line => {
	const points = options.points ?? [
		[-50, 0, 0],
		[50, 0, 0],
	];
	if (points.length < 2) {
		throw new Error("Line requires at least 2 points");
	}
	return {
		id: options.id ?? crypto.randomUUID(),
		type: NodeType.Line,
		name: options.name ?? "Line",
		transform: options.transform,
		points: prop<Vec3[]>(points.map((p) => [p[0], p[1], p[2]] as Vec3)),
		color: prop<Vec3>(options.color ?? [1, 1, 1]),
		width: prop(options.width ?? 2),
	};
};
