import type { Group } from "./group.ts";
import type { Node } from "./node.ts";
import type { Scene } from "./scene.ts";

const walkGroup = (group: Group, id: string): Node | undefined => {
	if (group.id === id) return group;
	for (const child of group.children) {
		const found = walkGroup(child, id);
		if (found) return found;
	}
	return undefined;
};

export const findNodeById = (scene: Scene, id: string): Node | undefined => {
	for (const layer of scene.layers) {
		if (layer.id === id) return layer;
		for (const child of layer.children) {
			const found = walkGroup(child, id);
			if (found) return found;
		}
	}
	return undefined;
};
