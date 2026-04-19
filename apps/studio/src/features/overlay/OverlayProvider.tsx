import { applyNodeOps, type Overlay, type Scene } from "@kut-kut/engine";
import { createMemo, type JSX } from "solid-js";
import { OverlayContext, type OverlayContextValue } from "./context.ts";
import { useOverlayPersistence } from "./persistence.ts";
import { createOverlayStore } from "./store.ts";

export type OverlayProviderProps = {
	name: string;
	overlay: Overlay;
	factory: () => Scene;
	children: JSX.Element;
};

export const OverlayProvider = (props: OverlayProviderProps): JSX.Element => {
	const store = createOverlayStore(props.overlay);
	const { saveState, saveError } = useOverlayPersistence(() => props.name, store.overlay);

	const structureKey = createMemo(() =>
		JSON.stringify({ a: store.overlay.additions, d: store.overlay.deletions }),
	);

	const scene = createMemo<Scene>(() => {
		structureKey();
		const s = props.factory();
		applyNodeOps(s, store.overlay);
		return s;
	});

	const value: OverlayContextValue = {
		name: () => props.name,
		overlay: store.overlay,
		scene,
		getOverride: store.getOverride,
		setOverride: store.setOverride,
		removeOverride: store.removeOverride,
		addNode: store.addNode,
		deleteNode: store.deleteNode,
		restoreNode: store.restoreNode,
		isDeleted: store.isDeleted,
		structureKey,
		saveState,
		saveError,
	};

	return <OverlayContext.Provider value={value}>{props.children}</OverlayContext.Provider>;
};
