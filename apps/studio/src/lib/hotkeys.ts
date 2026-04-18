export type HotkeyCombo = "Space" | "Home" | (string & {});

const isFormTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export const registerHotkey = (combo: HotkeyCombo, handler: () => void): (() => void) => {
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.code !== combo && event.key !== combo) return;
		if (isFormTarget(event.target)) return;
		if (event.repeat) return;
		event.preventDefault();
		handler();
	};
	window.addEventListener("keydown", onKeyDown);
	return () => window.removeEventListener("keydown", onKeyDown);
};
