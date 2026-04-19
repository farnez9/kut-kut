import { type JSX, onCleanup } from "solid-js";
import { CommandContext } from "./context.ts";
import { createCommandStore } from "./store.ts";

export type CommandProviderProps = {
	children: JSX.Element;
};

export const CommandProvider = (props: CommandProviderProps): JSX.Element => {
	const store = createCommandStore();
	onCleanup(() => store.clear());
	return <CommandContext.Provider value={store}>{props.children}</CommandContext.Provider>;
};
