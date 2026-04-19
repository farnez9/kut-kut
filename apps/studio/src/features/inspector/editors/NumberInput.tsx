import type { JSX } from "solid-js";
import { createEffect, createSignal } from "solid-js";

export type NumberInputProps = {
	value: number;
	onCommit: (value: number) => void;
	step?: number;
	min?: number;
	max?: number;
	label?: string;
};

const formatValue = (v: number): string => {
	if (!Number.isFinite(v)) return "";
	return String(Math.round(v * 10000) / 10000);
};

export const NumberInput = (props: NumberInputProps): JSX.Element => {
	const [draft, setDraft] = createSignal(formatValue(props.value));
	const [focused, setFocused] = createSignal(false);

	createEffect(() => {
		if (!focused()) setDraft(formatValue(props.value));
	});

	const commit = (): void => {
		const raw = draft().trim();
		if (raw === "") {
			setDraft(formatValue(props.value));
			return;
		}
		const n = Number(raw);
		if (!Number.isFinite(n)) {
			setDraft(formatValue(props.value));
			return;
		}
		if (n !== props.value) props.onCommit(n);
		else setDraft(formatValue(props.value));
	};

	return (
		<input
			class="inspector__input"
			type="text"
			inputmode="decimal"
			aria-label={props.label}
			value={draft()}
			step={props.step}
			onFocus={() => setFocused(true)}
			onBlur={() => {
				setFocused(false);
				commit();
			}}
			onInput={(e) => setDraft(e.currentTarget.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commit();
					e.currentTarget.blur();
				} else if (e.key === "Escape") {
					e.preventDefault();
					setDraft(formatValue(props.value));
					e.currentTarget.blur();
				}
			}}
		/>
	);
};
