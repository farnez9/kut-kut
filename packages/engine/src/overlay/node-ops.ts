import { createBox } from "../scene/box.ts";
import { findNodeByPath } from "../scene/find.ts";
import { createGroup } from "../scene/group.ts";
import type { Node } from "../scene/node.ts";
import { NodeType } from "../scene/node-type.ts";
import { createRect } from "../scene/rect.ts";
import type { Scene } from "../scene/scene.ts";
import { createTransform2D, createTransform3D, TransformKind } from "../scene/transform.ts";
import type { NodeAddition, NodeDeletion, NodeKind, Overlay } from "./schema.ts";

type ChildBearingNode = Extract<Node, { children: Node[] }>;

const hasChildren = (node: Node): node is ChildBearingNode =>
	node.type === NodeType.Group || node.type === NodeType.Layer2D || node.type === NodeType.Layer3D;

const deleteOne = (scene: Scene, deletion: NodeDeletion): void => {
	const path = deletion.path;
	if (path.length === 1) {
		const idx = scene.layers.findIndex((l) => l.name === path[0]);
		if (idx >= 0) scene.layers.splice(idx, 1);
		return;
	}
	const parent = findNodeByPath(scene, path.slice(0, -1));
	if (!parent || !hasChildren(parent)) return;
	const childName = path[path.length - 1];
	const index = parent.children.findIndex((c) => c.name === childName);
	if (index < 0) return;
	parent.children.splice(index, 1);
};

const resolveAdditionParent = (
	scene: Scene,
	parentPath: readonly string[],
): ChildBearingNode | null => {
	const parent = findNodeByPath(scene, parentPath);
	if (!parent || !hasChildren(parent)) return null;
	return parent;
};

const buildChild = (kind: NodeKind, name: string, parentKind: TransformKind): Node | null => {
	switch (kind) {
		case "rect":
			if (parentKind !== TransformKind.TwoD) return null;
			return createRect({ name, transform: { scaleX: 120, scaleY: 120 }, color: [0.9, 0.9, 0.9] });
		case "box":
			if (parentKind !== TransformKind.ThreeD) return null;
			return createBox({ name, transform: { scale: [160, 160, 160] }, color: [0.9, 0.9, 0.9] });
		case "group":
			return createGroup({
				name,
				transform: parentKind === TransformKind.TwoD ? createTransform2D() : createTransform3D(),
			});
	}
};

const addOne = (scene: Scene, addition: NodeAddition): void => {
	const parent = resolveAdditionParent(scene, addition.parentPath);
	if (!parent) return;
	if (parent.children.some((c) => c.name === addition.name)) return;
	const child = buildChild(addition.kind, addition.name, parent.transform.kind);
	if (!child) return;
	parent.children.push(child);
};

export const applyNodeOps = (scene: Scene, overlay: Overlay): void => {
	for (const addition of overlay.additions) addOne(scene, addition);
	for (const deletion of overlay.deletions) deleteOne(scene, deletion);
};
