import type { NodeKind, Overlay, OverrideValue, Scene } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";
import type { Store } from "solid-js/store";

export type OverlaySaveState = "idle" | "pending" | "saving" | "error";

export type AddNodeArgs = {
	parentPath: string[];
	name: string;
	kind: NodeKind;
};

export type OverlayContextValue = {
	name: Accessor<string>;
	overlay: Store<Overlay>;
	scene: Accessor<Scene>;
	getOverride: (nodePath: string[], property: string) => OverrideValue | undefined;
	setOverride: (nodePath: string[], property: string, value: OverrideValue) => void;
	removeOverride: (nodePath: string[], property: string) => void;
	addNode: (args: AddNodeArgs) => void;
	deleteNode: (path: string[]) => void;
	restoreNode: (path: string[]) => void;
	isDeleted: (path: string[]) => boolean;
	structureKey: Accessor<string>;
	saveState: Accessor<OverlaySaveState>;
	saveError: Accessor<Error | null>;
};

export const OverlayContext = createContext<OverlayContextValue>();

export const useOverlay = (): OverlayContextValue => {
	const ctx = useContext(OverlayContext);
	if (!ctx) throw new Error("useOverlay must be used inside <OverlayProvider>");
	return ctx;
};

export const sameNodePath = (a: readonly string[], b: readonly string[]): boolean => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
};
