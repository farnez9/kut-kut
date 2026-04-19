import type { Overlay } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { OverlayContext, type OverlayContextValue } from "./context.ts";
import { useOverlayPersistence } from "./persistence.ts";
import { createOverlayStore } from "./store.ts";

export type OverlayProviderProps = {
	name: string;
	overlay: Overlay;
	children: JSX.Element;
};

export const OverlayProvider = (props: OverlayProviderProps): JSX.Element => {
	const store = createOverlayStore(props.overlay);
	const { saveState, saveError } = useOverlayPersistence(() => props.name, store.overlay);

	const value: OverlayContextValue = {
		name: () => props.name,
		overlay: store.overlay,
		getOverride: store.getOverride,
		setOverride: store.setOverride,
		removeOverride: store.removeOverride,
		saveState,
		saveError,
	};

	return <OverlayContext.Provider value={value}>{props.children}</OverlayContext.Provider>;
};
