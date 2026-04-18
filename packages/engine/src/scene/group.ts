import type { Node } from "./node.ts";
import { NodeType } from "./node-type.ts";
import type { Transform } from "./transform.ts";
import { assertUniqueChildNames } from "./validate.ts";

export type Group = {
	readonly id: string;
	readonly type: typeof NodeType.Group;
	name: string;
	transform: Transform;
	children: Node[];
};

export type CreateGroupOptions = {
	id?: string;
	name?: string;
	transform: Transform;
	children?: Node[];
};

export const createGroup = (options: CreateGroupOptions): Group => {
	const name = options.name ?? "Group";
	const children = options.children ?? [];
	assertUniqueChildNames(name, children);
	return {
		id: options.id ?? crypto.randomUUID(),
		type: NodeType.Group,
		name,
		transform: options.transform,
		children,
	};
};
