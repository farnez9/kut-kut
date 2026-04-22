import type { MetaOverride, NodeKind, OverrideValue } from "@kut-kut/engine";
import type { Command } from "../../lib/commands/index.ts";
import { sameNodePath } from "./context.ts";
import type { OverlayMutator } from "./store.ts";

const findOverrideIndex = (
	overrides: { nodePath: string[]; property: string }[],
	nodePath: string[],
	property: string,
): number =>
	overrides.findIndex((o) => o.property === property && sameNodePath(o.nodePath, nodePath));

export const overrideValuesEqual = (
	a: OverrideValue | undefined,
	b: OverrideValue | undefined,
): boolean => {
	if (a === b) return true;
	if (a === undefined || b === undefined) return false;
	if (typeof a === "number" || typeof b === "number") return a === b;
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
};

const writeOverride = (
	mutate: OverlayMutator,
	nodePath: string[],
	property: string,
	value: OverrideValue | undefined,
): void => {
	mutate((draft) => {
		const idx = findOverrideIndex(draft.overrides, nodePath, property);
		if (value === undefined) {
			if (idx >= 0) draft.overrides.splice(idx, 1);
			return;
		}
		if (idx >= 0) {
			const entry = draft.overrides[idx];
			if (entry) entry.value = value;
			return;
		}
		draft.overrides.push({ nodePath: [...nodePath], property, value });
	});
};

export const setOverrideCommand = (
	mutate: OverlayMutator,
	nodePath: string[],
	property: string,
	prevValue: OverrideValue | undefined,
	nextValue: OverrideValue | undefined,
): Command => ({
	label:
		nextValue === undefined
			? "Clear override"
			: prevValue === undefined
				? "Set override"
				: "Update override",
	apply: () => writeOverride(mutate, nodePath, property, nextValue),
	invert: () => writeOverride(mutate, nodePath, property, prevValue),
});

export type AdditionSpec = {
	parentPath: string[];
	name: string;
	kind: NodeKind;
};

export const addNodeCommand = (mutate: OverlayMutator, addition: AdditionSpec): Command => {
	const apply = (): void => {
		mutate((draft) => {
			const exists = draft.additions.some(
				(a) => a.name === addition.name && sameNodePath(a.parentPath, addition.parentPath),
			);
			if (exists) return;
			draft.additions.push({
				parentPath: [...addition.parentPath],
				name: addition.name,
				kind: addition.kind,
			});
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			const idx = draft.additions.findIndex(
				(a) => a.name === addition.name && sameNodePath(a.parentPath, addition.parentPath),
			);
			if (idx >= 0) draft.additions.splice(idx, 1);
		});
	};
	return { label: "Add node", apply, invert };
};

export const deleteNodeCommand = (mutate: OverlayMutator, path: string[]): Command => {
	const apply = (): void => {
		mutate((draft) => {
			if (draft.deletions.some((d) => sameNodePath(d.path, path))) return;
			draft.deletions.push({ path: [...path] });
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			const idx = draft.deletions.findIndex((d) => sameNodePath(d.path, path));
			if (idx >= 0) draft.deletions.splice(idx, 1);
		});
	};
	return { label: "Delete node", apply, invert };
};

export const restoreNodeCommand = (mutate: OverlayMutator, path: string[]): Command => {
	const apply = (): void => {
		mutate((draft) => {
			const idx = draft.deletions.findIndex((d) => sameNodePath(d.path, path));
			if (idx >= 0) draft.deletions.splice(idx, 1);
		});
	};
	const invert = (): void => {
		mutate((draft) => {
			if (draft.deletions.some((d) => sameNodePath(d.path, path))) return;
			draft.deletions.push({ path: [...path] });
		});
	};
	return { label: "Restore node", apply, invert };
};

const cloneMeta = (meta: MetaOverride | undefined): MetaOverride | undefined =>
	meta ? { ...meta } : undefined;

const writeMeta = (mutate: OverlayMutator, next: MetaOverride | undefined): void => {
	mutate((draft) => {
		if (next === undefined || Object.keys(next).length === 0) {
			delete draft.meta;
			return;
		}
		draft.meta = { ...next };
	});
};

export const setOverlayMetaCommand = (
	mutate: OverlayMutator,
	prev: MetaOverride | undefined,
	next: MetaOverride | undefined,
): Command => {
	const prevSnap = cloneMeta(prev);
	const nextSnap = cloneMeta(next);
	return {
		label: "Set scene meta",
		apply: () => writeMeta(mutate, nextSnap),
		invert: () => writeMeta(mutate, prevSnap),
	};
};
