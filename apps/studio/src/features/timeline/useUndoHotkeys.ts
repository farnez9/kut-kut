import { onCleanup, onMount } from "solid-js";

export type UndoHotkeysOptions = {
	undo: () => void;
	redo: () => void;
};

const isEditableTarget = (el: EventTarget | null): boolean => {
	if (!(el instanceof Element)) return false;
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
	return el.matches?.('[contenteditable], [contenteditable="true"]') ?? false;
};

export const useUndoHotkeys = (opts: UndoHotkeysOptions): void => {
	const onKeydown = (e: KeyboardEvent): void => {
		if (!(e.metaKey || e.ctrlKey)) return;
		if (isEditableTarget(e.target)) return;
		const key = e.key.toLowerCase();
		if (key === "z" && !e.shiftKey) {
			e.preventDefault();
			opts.undo();
			return;
		}
		if ((key === "z" && e.shiftKey) || key === "y") {
			e.preventDefault();
			opts.redo();
		}
	};

	onMount(() => window.addEventListener("keydown", onKeydown));
	onCleanup(() => window.removeEventListener("keydown", onKeydown));
};
