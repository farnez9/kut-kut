export type PointerDragHandlers = {
	onMove: (dx: number, dy: number, e: PointerEvent) => void;
	onEnd?: (e: PointerEvent) => void;
	onCancel?: () => void;
};

export const startPointerDrag = (e: PointerEvent, handlers: PointerDragHandlers): (() => void) => {
	const target = e.currentTarget as Element | null;
	const startX = e.clientX;
	const startY = e.clientY;
	const pointerId = e.pointerId;
	let released = false;

	try {
		target?.setPointerCapture?.(pointerId);
	} catch {
		/* ignore — browser may reject capture on a non-primary pointer */
	}

	const onMove = (ev: PointerEvent): void => {
		if (ev.pointerId !== pointerId) return;
		handlers.onMove(ev.clientX - startX, ev.clientY - startY, ev);
	};

	const onUp = (ev: PointerEvent): void => {
		if (ev.pointerId !== pointerId) return;
		cleanup();
		handlers.onEnd?.(ev);
	};

	const onCancel = (ev: PointerEvent): void => {
		if (ev.pointerId !== pointerId) return;
		cleanup();
		handlers.onCancel?.();
	};

	const cleanup = (): void => {
		if (released) return;
		released = true;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
		try {
			target?.releasePointerCapture?.(pointerId);
		} catch {
			/* ignore */
		}
	};

	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
	window.addEventListener("pointercancel", onCancel);

	return cleanup;
};
