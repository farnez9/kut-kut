import { createContext, useContext } from "solid-js";
import type { CommandStore } from "./store.ts";

export const CommandContext = createContext<CommandStore>();

export const useCommands = (): CommandStore => {
	const ctx = useContext(CommandContext);
	if (!ctx) throw new Error("useCommands must be used inside <CommandProvider>");
	return ctx;
};
