import type { Overlay, OverrideValue } from "@kut-kut/engine";
import { createStore, produce, type Store } from "solid-js/store";
import { sameNodePath } from "./context.ts";

export type OverlayStore = {
	overlay: Store<Overlay>;
	getOverride: (nodePath: string[], property: string) => OverrideValue | undefined;
	setOverride: (nodePath: string[], property: string, value: OverrideValue) => void;
	removeOverride: (nodePath: string[], property: string) => void;
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

	return { overlay, getOverride, setOverride, removeOverride };
};
