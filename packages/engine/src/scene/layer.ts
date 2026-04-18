import type { Node } from "./node.ts";
import { NodeType } from "./node-type.ts";
import {
	createTransform2D,
	createTransform3D,
	type Transform2D,
	type Transform2DInit,
	type Transform3D,
	type Transform3DInit,
} from "./transform.ts";
import { assertUniqueChildNames } from "./validate.ts";

export type Scene2DLayer = {
	readonly id: string;
	readonly type: typeof NodeType.Layer2D;
	name: string;
	transform: Transform2D;
	children: Node[];
};

export type Scene3DLayer = {
	readonly id: string;
	readonly type: typeof NodeType.Layer3D;
	name: string;
	transform: Transform3D;
	children: Node[];
};

export type Layer = Scene2DLayer | Scene3DLayer;

export type CreateLayer2DOptions = {
	id?: string;
	name?: string;
	transform?: Transform2DInit;
	children?: Node[];
};

export type CreateLayer3DOptions = {
	id?: string;
	name?: string;
	transform?: Transform3DInit;
	children?: Node[];
};

export const createLayer2D = (options: CreateLayer2DOptions = {}): Scene2DLayer => {
	const name = options.name ?? "2D Layer";
	const children = options.children ?? [];
	assertUniqueChildNames(name, children);
	return {
		id: options.id ?? crypto.randomUUID(),
		type: NodeType.Layer2D,
		name,
		transform: createTransform2D(options.transform),
		children,
	};
};

export const createLayer3D = (options: CreateLayer3DOptions = {}): Scene3DLayer => {
	const name = options.name ?? "3D Layer";
	const children = options.children ?? [];
	assertUniqueChildNames(name, children);
	return {
		id: options.id ?? crypto.randomUUID(),
		type: NodeType.Layer3D,
		name,
		transform: createTransform3D(options.transform),
		children,
	};
};
