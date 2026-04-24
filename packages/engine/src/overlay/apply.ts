import {
	isNumberProperty,
	isStringProperty,
	isVec3ArrayProperty,
	isVec3Property,
	resolveProperty,
} from "../reactive/resolve-property.ts";
import { findNodeByPath } from "../scene/find.ts";
import type { Node } from "../scene/node.ts";
import type { Scene } from "../scene/scene.ts";
import type { Vec3 } from "../scene/transform.ts";
import type { Overlay, OverrideValue, PropertyOverride } from "./schema.ts";

const isVec3 = (v: unknown): v is Vec3 =>
	Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number");

const writeOverride = (node: Node, property: string, value: OverrideValue): void => {
	const resolved = resolveProperty(node, property);
	if (!resolved) return;
	if (typeof value === "number") {
		if (isNumberProperty(resolved)) resolved.set(value);
		return;
	}
	if (typeof value === "string") {
		if (isStringProperty(resolved)) resolved.set(value);
		return;
	}
	if (isVec3(value)) {
		if (isVec3Property(resolved)) resolved.set(value);
		return;
	}
	if (Array.isArray(value) && value.every(isVec3)) {
		if (isVec3ArrayProperty(resolved)) resolved.set(value);
	}
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

export const applyOverlayMeta = (scene: Scene, overlay: Overlay): void => {
	const meta = overlay.meta;
	if (!meta) return;
	if (meta.width !== undefined) scene.meta.width = meta.width;
	if (meta.height !== undefined) scene.meta.height = meta.height;
	if (meta.fps !== undefined) scene.meta.fps = meta.fps;
	if (meta.duration !== undefined) scene.meta.duration = meta.duration;
};
