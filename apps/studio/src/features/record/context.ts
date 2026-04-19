import { type Accessor, createContext, useContext } from "solid-js";

export type RecordContextValue = {
	active: Accessor<boolean>;
	toggle: () => void;
	setActive: (next: boolean) => void;
};

export const RecordContext = createContext<RecordContextValue>();

export const useRecord = (): RecordContextValue => {
	const ctx = useContext(RecordContext);
	if (!ctx) throw new Error("useRecord must be used inside <RecordProvider>");
	return ctx;
};
