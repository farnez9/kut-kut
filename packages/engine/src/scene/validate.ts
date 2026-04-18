import type { Layer } from "./layer.ts";
import type { Node } from "./node.ts";
import { NodeType } from "./node-type.ts";
import type { Scene } from "./scene.ts";

const checkUnique = (names: readonly string[], context: string): void => {
	const seen = new Set<string>();
	for (const name of names) {
		if (seen.has(name)) {
			throw new Error(
				`Duplicate child name "${name}" in ${context}. Siblings must have unique names so timeline nodePath targets can resolve.`,
			);
		}
		seen.add(name);
	}
};

export const assertUniqueLayerNames = (layers: readonly Layer[]): void => {
	checkUnique(
		layers.map((l) => l.name),
		"scene",
	);
};

export const assertUniqueChildNames = (parent: string, children: readonly Node[]): void => {
	checkUnique(
		children.map((c) => c.name),
		`"${parent}"`,
	);
};

const hasChildren = (node: Node): node is Extract<Node, { children: Node[] }> =>
	node.type === NodeType.Group || node.type === NodeType.Layer2D || node.type === NodeType.Layer3D;

const walk = (node: Node): void => {
	if (!hasChildren(node)) return;
	assertUniqueChildNames(node.name, node.children);
	for (const child of node.children) walk(child);
};

export const assertSceneStructure = (scene: Scene): void => {
	assertUniqueLayerNames(scene.layers);
	for (const layer of scene.layers) walk(layer);
};
