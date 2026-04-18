import { NodeType } from "./node-type.ts";
import type { Transform } from "./transform.ts";

export type Group = {
	readonly id: string;
	readonly type: typeof NodeType.Group;
	name: string;
	transform: Transform;
	children: Group[];
};

export type CreateGroupOptions = {
	id?: string;
	name?: string;
	transform: Transform;
	children?: Group[];
};

export const createGroup = (options: CreateGroupOptions): Group => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Group,
	name: options.name ?? "Group",
	transform: options.transform,
	children: options.children ?? [],
});
