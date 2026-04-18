import { type Property, prop } from "../reactive/property.ts";
import { NodeType } from "./node-type.ts";
import {
	createTransform2D,
	type Transform2D,
	type Transform2DInit,
	type Vec3,
} from "./transform.ts";

export type Rect = {
	readonly id: string;
	readonly type: typeof NodeType.Rect;
	name: string;
	transform: Transform2D;
	color: Property<Vec3>;
};

export type CreateRectOptions = {
	id?: string;
	name?: string;
	transform?: Transform2DInit;
	color?: Vec3;
};

export const createRect = (options: CreateRectOptions = {}): Rect => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Rect,
	name: options.name ?? "Rect",
	transform: createTransform2D(options.transform),
	color: prop<Vec3>(options.color ?? [1, 1, 1]),
});
