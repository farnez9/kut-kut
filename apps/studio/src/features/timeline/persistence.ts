import { serializeTimeline, type Timeline, type TimelineJSON } from "@kut-kut/engine";
import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";
import type { Store } from "solid-js/store";
import { writeTimeline } from "../../lib/plugin-client.ts";
import type { TimelineSaveState } from "./context.ts";

const DEBOUNCE_MS = 300;

export type UseTimelinePersistenceResult = {
	saveState: Accessor<TimelineSaveState>;
	saveError: Accessor<Error | null>;
};

export const useTimelinePersistence = (
	name: Accessor<string>,
	timeline: Store<Timeline>,
): UseTimelinePersistenceResult => {
	const [saveState, setSaveState] = createSignal<TimelineSaveState>("idle");
	const [saveError, setSaveError] = createSignal<Error | null>(null);

	let pending: TimelineJSON | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight = false;

	const flush = async (): Promise<void> => {
		if (pending === null || inFlight) return;
		const json = pending;
		pending = null;
		inFlight = true;
		setSaveState("saving");
		try {
			await writeTimeline(name(), json);
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
			() => serializeTimeline(timeline),
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
