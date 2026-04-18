import { type Property, prop } from "../reactive/property.ts";
import { NodeType } from "./node-type.ts";
import {
	createTransform3D,
	type Transform3D,
	type Transform3DInit,
	type Vec3,
} from "./transform.ts";

export type Box = {
	readonly id: string;
	readonly type: typeof NodeType.Box;
	name: string;
	transform: Transform3D;
	color: Property<Vec3>;
};

export type CreateBoxOptions = {
	id?: string;
	name?: string;
	transform?: Transform3DInit;
	color?: Vec3;
};

export const createBox = (options: CreateBoxOptions = {}): Box => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Box,
	name: options.name ?? "Box",
	transform: createTransform3D(options.transform),
	color: prop<Vec3>(options.color ?? [1, 1, 1]),
});
