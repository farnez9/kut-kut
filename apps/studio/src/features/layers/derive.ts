import {
	createBox,
	createGroup,
	createRect,
	createTransform2D,
	createTransform3D,
	type Node,
	type NodeAddition,
	NodeType,
	type Overlay,
	type Scene,
	TransformKind,
} from "@kut-kut/engine";
import { sameNodePath } from "../overlay/context.ts";

export type LayerSource = "author" | "added";

export type LayerTreeNode = {
	node: Node;
	nodePath: string[];
	source: LayerSource;
	deleted: boolean;
	deletedAncestor: boolean;
	children: LayerTreeNode[];
};

type ChildBearing = Extract<Node, { children: Node[] }>;

const hasChildren = (node: Node): node is ChildBearing =>
	node.type === NodeType.Group || node.type === NodeType.Layer2D || node.type === NodeType.Layer3D;

const parentTransformKind = (node: Node): TransformKind => node.transform.kind;

const isDeletedPath = (overlay: Overlay, path: string[]): boolean =>
	overlay.deletions.some((d) => sameNodePath(d.path, path));

const buildPlaceholder = (addition: NodeAddition, parentKind: TransformKind): Node | null => {
	switch (addition.kind) {
		case "rect":
			if (parentKind !== TransformKind.TwoD) return null;
			return createRect({ name: addition.name });
		case "box":
			if (parentKind !== TransformKind.ThreeD) return null;
			return createBox({ name: addition.name });
		case "group":
			return createGroup({
				name: addition.name,
				transform: parentKind === TransformKind.TwoD ? createTransform2D() : createTransform3D(),
			});
	}
};

const childAdditionsFor = (overlay: Overlay, parentPath: string[]): NodeAddition[] =>
	overlay.additions.filter((a) => sameNodePath(a.parentPath, parentPath));

const deriveChildren = (
	node: Node,
	path: string[],
	overlay: Overlay,
	ancestorDeleted: boolean,
): LayerTreeNode[] => {
	if (!hasChildren(node)) return [];
	const authorKids = node.children.map((child) =>
		deriveOne(child, [...path, child.name], "author", overlay, ancestorDeleted),
	);
	const additions = childAdditionsFor(overlay, path);
	const addedKids: LayerTreeNode[] = [];
	const parentKind = parentTransformKind(node);
	const existingNames = new Set(node.children.map((c) => c.name));
	for (const addition of additions) {
		if (existingNames.has(addition.name)) continue;
		const placeholder = buildPlaceholder(addition, parentKind);
		if (!placeholder) continue;
		const childPath = [...path, addition.name];
		addedKids.push(deriveOne(placeholder, childPath, "added", overlay, ancestorDeleted));
		existingNames.add(addition.name);
	}
	return [...authorKids, ...addedKids];
};

const deriveOne = (
	node: Node,
	path: string[],
	source: LayerSource,
	overlay: Overlay,
	ancestorDeleted: boolean,
): LayerTreeNode => {
	const deleted = isDeletedPath(overlay, path);
	const downstreamAncestor = ancestorDeleted || deleted;
	return {
		node,
		nodePath: path,
		source,
		deleted,
		deletedAncestor: ancestorDeleted,
		children: deriveChildren(node, path, overlay, downstreamAncestor),
	};
};

export const deriveLayerTree = (scene: Scene, overlay: Overlay): LayerTreeNode[] =>
	scene.layers.map((layer) => deriveOne(layer, [layer.name], "author", overlay, false));

export const pickUniqueName = (siblingNames: readonly string[], base: string): string => {
	const taken = new Set(siblingNames);
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`)) n++;
	return `${base} ${n}`;
};
