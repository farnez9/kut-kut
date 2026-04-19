import type { Accessor } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { Command } from "./types.ts";

const HISTORY_CAP = 200;

export type CommandStore = {
	push: (cmd: Command) => void;
	undo: () => void;
	redo: () => void;
	canUndo: Accessor<boolean>;
	canRedo: Accessor<boolean>;
	clear: () => void;
};

type State = {
	past: Command[];
	future: Command[];
};

export const createCommandStore = (): CommandStore => {
	const [state, setState] = createStore<State>({ past: [], future: [] });

	const trimPast = (past: Command[]): Command[] =>
		past.length >= HISTORY_CAP ? past.slice(past.length - HISTORY_CAP + 1) : past;

	const push = (cmd: Command): void => {
		cmd.apply();
		setState(
			produce((s) => {
				s.past = [...trimPast(s.past), cmd];
				s.future = [];
			}),
		);
	};

	const undo = (): void => {
		const cmd = state.past[state.past.length - 1];
		if (!cmd) return;
		cmd.invert();
		setState(
			produce((s) => {
				s.past = s.past.slice(0, -1);
				s.future = [...s.future, cmd];
			}),
		);
	};

	const redo = (): void => {
		const cmd = state.future[state.future.length - 1];
		if (!cmd) return;
		cmd.apply();
		setState(
			produce((s) => {
				s.future = s.future.slice(0, -1);
				s.past = [...trimPast(s.past), cmd];
			}),
		);
	};

	const clear = (): void => {
		setState({ past: [], future: [] });
	};

	const canUndo: Accessor<boolean> = () => state.past.length > 0;
	const canRedo: Accessor<boolean> = () => state.future.length > 0;

	return { push, undo, redo, canUndo, canRedo, clear };
};
