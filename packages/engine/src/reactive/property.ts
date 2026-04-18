import { type Accessor, createSignal, type Setter } from "solid-js";

export type Property<T> = {
	readonly get: Accessor<T>;
	readonly set: Setter<T>;
	readonly initial: T;
};

export const prop = <T>(initial: T): Property<T> => {
	const [get, set] = createSignal<T>(initial);
	return { get, set, initial };
};
