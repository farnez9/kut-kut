import { onCleanup, onMount } from "solid-js";
import { useCommands } from "./commands/index.ts";

const isEditableTarget = (el: EventTarget | null): boolean => {
	if (!(el instanceof Element)) return false;
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
	return el.matches?.('[contenteditable], [contenteditable="true"]') ?? false;
};

export const useUndoHotkeys = (): void => {
	const commands = useCommands();

	const onKeydown = (e: KeyboardEvent): void => {
		if (!(e.metaKey || e.ctrlKey)) return;
		if (isEditableTarget(e.target)) return;
		const key = e.key.toLowerCase();
		if (key === "z" && !e.shiftKey) {
			e.preventDefault();
			commands.undo();
			return;
		}
		if ((key === "z" && e.shiftKey) || key === "y") {
			e.preventDefault();
			commands.redo();
		}
	};

	onMount(() => window.addEventListener("keydown", onKeydown));
	onCleanup(() => window.removeEventListener("keydown", onKeydown));
};

export { isEditableTarget };
