import type { Overlay } from "@kut-kut/engine";
import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";
import type { Store } from "solid-js/store";
import { writeOverlay } from "../../lib/plugin-client.ts";
import type { OverlaySaveState } from "./context.ts";

const DEBOUNCE_MS = 300;

export type UseOverlayPersistenceResult = {
	saveState: Accessor<OverlaySaveState>;
	saveError: Accessor<Error | null>;
};

const snapshot = (overlay: Store<Overlay>): Overlay => ({
	schemaVersion: overlay.schemaVersion,
	overrides: overlay.overrides.map((o) => ({
		nodePath: [...o.nodePath],
		property: o.property,
		value: Array.isArray(o.value) ? ([...o.value] as [number, number, number]) : o.value,
	})),
});

export const useOverlayPersistence = (
	name: Accessor<string>,
	overlay: Store<Overlay>,
): UseOverlayPersistenceResult => {
	const [saveState, setSaveState] = createSignal<OverlaySaveState>("idle");
	const [saveError, setSaveError] = createSignal<Error | null>(null);

	let pending: Overlay | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight = false;

	const flush = async (): Promise<void> => {
		if (pending === null || inFlight) return;
		const json = pending;
		pending = null;
		inFlight = true;
		setSaveState("saving");
		try {
			await writeOverlay(name(), json);
			setSaveError(null);
			setSaveState(pending ? "pending" : "idle");
		} catch (err) {
			setSaveError(err instanceof Error ? err : new Error(String(err)));
			setSaveState("error");
		} finally {
			inFlight = false;
			if (pending) queueMicrotask(() => void flush());
		}
	};

	createEffect(
		on(
			() => snapshot(overlay),
			(json) => {
				pending = json;
				setSaveState("pending");
				if (timer) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					void flush();
				}, DEBOUNCE_MS);
			},
			{ defer: true },
		),
	);

	onCleanup(() => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (pending) void flush();
	});

	return { saveState, saveError };
};
