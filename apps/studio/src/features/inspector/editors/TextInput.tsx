import type { JSX } from "solid-js";
import { createEffect, createSignal } from "solid-js";

export type TextInputProps = {
	value: string;
	onCommit: (value: string) => void;
	label?: string;
};

export const TextInput = (props: TextInputProps): JSX.Element => {
	const [draft, setDraft] = createSignal(props.value);
	const [focused, setFocused] = createSignal(false);

	createEffect(() => {
		if (!focused()) setDraft(props.value);
	});

	const commit = (): void => {
		if (draft() !== props.value) props.onCommit(draft());
	};

	return (
		<input
			class="inspector__input"
			type="text"
			aria-label={props.label}
			value={draft()}
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
					setDraft(props.value);
					e.currentTarget.blur();
				}
			}}
		/>
	);
};
