import { createSignal, type JSX, onCleanup } from "solid-js";
import { registerHotkey } from "../../lib/index.ts";
import { RecordContext, type RecordContextValue } from "./context.ts";

export type RecordProviderProps = {
	children: JSX.Element;
};

export const RecordProvider = (props: RecordProviderProps): JSX.Element => {
	const [active, setActive] = createSignal(false);

	const toggle = (): void => {
		setActive((v) => !v);
	};

	const disposeHotkey = registerHotkey("r", toggle);
	onCleanup(() => disposeHotkey());

	const value: RecordContextValue = {
		active,
		toggle,
		setActive,
	};

	return <RecordContext.Provider value={value}>{props.children}</RecordContext.Provider>;
};
