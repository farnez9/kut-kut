import type { Node } from "./node.ts";
import { NodeType } from "./node-type.ts";
import type { Scene } from "./scene.ts";

const hasChildren = (node: Node): node is Extract<Node, { children: Node[] }> =>
	node.type === NodeType.Group || node.type === NodeType.Layer2D || node.type === NodeType.Layer3D;

const walk = (node: Node, id: string): Node | undefined => {
	if (node.id === id) return node;
	if (!hasChildren(node)) return undefined;
	for (const child of node.children) {
		const found = walk(child, id);
		if (found) return found;
	}
	return undefined;
};

export const findNodeById = (scene: Scene, id: string): Node | undefined => {
	for (const layer of scene.layers) {
		const found = walk(layer, id);
		if (found) return found;
	}
	return undefined;
};

const descend = (node: Node, remaining: readonly string[]): Node | undefined => {
	if (remaining.length === 0) return node;
	if (!hasChildren(node)) return undefined;
	const [head, ...rest] = remaining;
	const child = node.children.find((c) => c.name === head);
	if (!child) return undefined;
	return descend(child, rest);
};

export const findNodeByPath = (scene: Scene, path: readonly string[]): Node | undefined => {
	if (path.length === 0) return undefined;
	const [head, ...rest] = path;
	const layer = scene.layers.find((l) => l.name === head);
	if (!layer) return undefined;
	return descend(layer, rest);
};
