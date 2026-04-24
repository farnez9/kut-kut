import { type Property, prop } from "../reactive/property.ts";
import { NodeType } from "./node-type.ts";
import type { Transform } from "./transform.ts";

export type Image = {
	readonly id: string;
	readonly type: typeof NodeType.Image;
	name: string;
	transform: Transform;
	src: Property<string>;
	width: Property<number>;
	height: Property<number>;
};

export type CreateImageOptions = {
	id?: string;
	name?: string;
	transform: Transform;
	src: string;
	width: number;
	height: number;
};

export const createImage = (options: CreateImageOptions): Image => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Image,
	name: options.name ?? "Image",
	transform: options.transform,
	src: prop(options.src),
	width: prop(options.width),
	height: prop(options.height),
});
