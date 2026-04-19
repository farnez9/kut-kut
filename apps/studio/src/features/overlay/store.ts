import type { NodeKind, Overlay, OverrideValue } from "@kut-kut/engine";
import { createStore, produce, type Store } from "solid-js/store";
import { sameNodePath } from "./context.ts";

export type AddNodeArgs = {
	parentPath: string[];
	name: string;
	kind: NodeKind;
};

export type OverlayMutator = (fn: (draft: Overlay) => void) => void;

export type OverlayStore = {
	overlay: Store<Overlay>;
	mutate: OverlayMutator;
	getOverride: (nodePath: string[], property: string) => OverrideValue | undefined;
	isDeleted: (path: string[]) => boolean;
};

const findIndex = (overlay: Overlay, nodePath: string[], property: string): number =>
	overlay.overrides.findIndex((o) => o.property === property && sameNodePath(o.nodePath, nodePath));

export const createOverlayStore = (initial: Overlay): OverlayStore => {
	const [overlay, setOverlay] = createStore<Overlay>(initial);

	const mutate: OverlayMutator = (fn) => setOverlay(produce(fn));

	const getOverride = (nodePath: string[], property: string): OverrideValue | undefined => {
		const idx = findIndex(overlay, nodePath, property);
		return idx >= 0 ? overlay.overrides[idx]?.value : undefined;
	};

	const isDeleted = (path: string[]): boolean =>
		overlay.deletions.some((d) => sameNodePath(d.path, path));

	return { overlay, mutate, getOverride, isDeleted };
};
