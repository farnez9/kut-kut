import { isNumberProperty, isVec3Property, resolveProperty } from "../reactive/resolve-property.ts";
import { findNodeByPath } from "../scene/find.ts";
import type { Node } from "../scene/node.ts";
import type { Scene } from "../scene/scene.ts";
import type { Overlay, OverrideValue, PropertyOverride } from "./schema.ts";

const writeOverride = (node: Node, property: string, value: OverrideValue): void => {
	const resolved = resolveProperty(node, property);
	if (!resolved) return;
	if (typeof value === "number") {
		if (isNumberProperty(resolved)) resolved.set(value);
		return;
	}
	if (isVec3Property(resolved)) resolved.set(value);
};

const applyOverride = (scene: Scene, override: PropertyOverride): void => {
	const node = findNodeByPath(scene, override.nodePath);
	if (!node) return;
	writeOverride(node, override.property, override.value);
};

export const applyOverlay = (scene: Scene, overlay: Overlay): void => {
	for (const override of overlay.overrides) {
		applyOverride(scene, override);
	}
};
