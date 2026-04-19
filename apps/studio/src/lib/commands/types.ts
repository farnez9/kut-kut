export type Command = {
	label: string;
	apply: () => void;
	invert: () => void;
};
