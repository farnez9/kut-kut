import type { NodeKind, Overlay, OverrideValue } from "@kut-kut/engine";
import { createStore, produce, type Store } from "solid-js/store";
import { sameNodePath } from "./context.ts";

export type AddNodeArgs = {
	parentPath: string[];
	name: string;
	kind: NodeKind;
};

export type OverlayStore = {
	overlay: Store<Overlay>;
	getOverride: (nodePath: string[], property: string) => OverrideValue | undefined;
	setOverride: (nodePath: string[], property: string, value: OverrideValue) => void;
	removeOverride: (nodePath: string[], property: string) => void;
	addNode: (args: AddNodeArgs) => void;
	deleteNode: (path: string[]) => void;
	restoreNode: (path: string[]) => void;
	isDeleted: (path: string[]) => boolean;
};

const findIndex = (overlay: Overlay, nodePath: string[], property: string): number =>
	overlay.overrides.findIndex((o) => o.property === property && sameNodePath(o.nodePath, nodePath));

export const createOverlayStore = (initial: Overlay): OverlayStore => {
	const [overlay, setOverlay] = createStore<Overlay>(initial);

	const getOverride = (nodePath: string[], property: string): OverrideValue | undefined => {
		const idx = findIndex(overlay, nodePath, property);
		return idx >= 0 ? overlay.overrides[idx]?.value : undefined;
	};

	const setOverride = (nodePath: string[], property: string, value: OverrideValue): void => {
		setOverlay(
			produce((draft) => {
				const idx = findIndex(draft, nodePath, property);
				if (idx >= 0) {
					const entry = draft.overrides[idx];
					if (entry) entry.value = value;
					return;
				}
				draft.overrides.push({ nodePath: [...nodePath], property, value });
			}),
		);
	};

	const removeOverride = (nodePath: string[], property: string): void => {
		setOverlay(
			produce((draft) => {
				const idx = findIndex(draft, nodePath, property);
				if (idx >= 0) draft.overrides.splice(idx, 1);
			}),
		);
	};

	const addNode = (args: AddNodeArgs): void => {
		setOverlay(
			produce((draft) => {
				const parentPath = [...args.parentPath];
				const exists = draft.additions.some(
					(a) => a.name === args.name && sameNodePath(a.parentPath, parentPath),
				);
				if (exists) return;
				draft.additions.push({ parentPath, name: args.name, kind: args.kind });
			}),
		);
	};

	const deleteNode = (path: string[]): void => {
		setOverlay(
			produce((draft) => {
				if (draft.deletions.some((d) => sameNodePath(d.path, path))) return;
				draft.deletions.push({ path: [...path] });
			}),
		);
	};

	const restoreNode = (path: string[]): void => {
		setOverlay(
			produce((draft) => {
				const idx = draft.deletions.findIndex((d) => sameNodePath(d.path, path));
				if (idx >= 0) draft.deletions.splice(idx, 1);
			}),
		);
	};

	const isDeleted = (path: string[]): boolean =>
		overlay.deletions.some((d) => sameNodePath(d.path, path));

	return {
		overlay,
		getOverride,
		setOverride,
		removeOverride,
		addNode,
		deleteNode,
		restoreNode,
		isDeleted,
	};
};
