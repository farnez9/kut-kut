import type { Group } from "./group.ts";
import { NodeType } from "./node-type.ts";
import {
	createTransform2D,
	createTransform3D,
	type Transform2D,
	type Transform2DInit,
	type Transform3D,
	type Transform3DInit,
} from "./transform.ts";

export type Scene2DLayer = {
	readonly id: string;
	readonly type: typeof NodeType.Layer2D;
	name: string;
	transform: Transform2D;
	children: Group[];
};

export type Scene3DLayer = {
	readonly id: string;
	readonly type: typeof NodeType.Layer3D;
	name: string;
	transform: Transform3D;
	children: Group[];
};

export type Layer = Scene2DLayer | Scene3DLayer;

export type CreateLayer2DOptions = {
	id?: string;
	name?: string;
	transform?: Transform2DInit;
	children?: Group[];
};

export type CreateLayer3DOptions = {
	id?: string;
	name?: string;
	transform?: Transform3DInit;
	children?: Group[];
};

export const createLayer2D = (options: CreateLayer2DOptions = {}): Scene2DLayer => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Layer2D,
	name: options.name ?? "2D Layer",
	transform: createTransform2D(options.transform),
	children: options.children ?? [],
});

export const createLayer3D = (options: CreateLayer3DOptions = {}): Scene3DLayer => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Layer3D,
	name: options.name ?? "3D Layer",
	transform: createTransform3D(options.transform),
	children: options.children ?? [],
});
