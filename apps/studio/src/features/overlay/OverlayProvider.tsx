import {
	applyNodeOps,
	applyOverlayMeta,
	type MetaOverride,
	type Overlay,
	type OverrideValue,
	type Scene,
} from "@kut-kut/engine";
import { createMemo, type JSX } from "solid-js";
import { useCommands } from "../../lib/commands/index.ts";
import {
	addNodeCommand,
	deleteNodeCommand,
	overrideValuesEqual,
	restoreNodeCommand,
	setOverlayMetaCommand,
	setOverrideCommand,
} from "./commands.ts";
import {
	type AddNodeArgs,
	OverlayContext,
	type OverlayContextValue,
	sameNodePath,
} from "./context.ts";
import { useOverlayPersistence } from "./persistence.ts";
import { createOverlayStore } from "./store.ts";

export type OverlayProviderProps = {
	name: string;
	overlay: Overlay;
	factory: () => Scene;
	children: JSX.Element;
};

export const OverlayProvider = (props: OverlayProviderProps): JSX.Element => {
	const commands = useCommands();
	const store = createOverlayStore(props.overlay);
	const { saveState, saveError } = useOverlayPersistence(() => props.name, store.overlay);

	const structureKey = createMemo(() =>
		JSON.stringify({
			a: store.overlay.additions,
			d: store.overlay.deletions,
			m: store.overlay.meta ?? null,
		}),
	);

	const scene = createMemo<Scene>(() => {
		structureKey();
		const s = props.factory();
		applyNodeOps(s, store.overlay);
		applyOverlayMeta(s, store.overlay);
		return s;
	});

	const setOverride = (nodePath: string[], property: string, value: OverrideValue): void => {
		const prev = store.getOverride(nodePath, property);
		if (overrideValuesEqual(prev, value)) return;
		commands.push(setOverrideCommand(store.mutate, nodePath, property, prev, value));
	};

	const removeOverride = (nodePath: string[], property: string): void => {
		const prev = store.getOverride(nodePath, property);
		if (prev === undefined) return;
		commands.push(setOverrideCommand(store.mutate, nodePath, property, prev, undefined));
	};

	const addNode = (args: AddNodeArgs): void => {
		const exists = store.overlay.additions.some(
			(a) => a.name === args.name && sameNodePath(a.parentPath, args.parentPath),
		);
		if (exists) return;
		commands.push(addNodeCommand(store.mutate, args));
	};

	const deleteNode = (path: string[]): void => {
		if (store.isDeleted(path)) return;
		commands.push(deleteNodeCommand(store.mutate, path));
	};

	const restoreNode = (path: string[]): void => {
		if (!store.isDeleted(path)) return;
		commands.push(restoreNodeCommand(store.mutate, path));
	};

	const metasEqual = (a: MetaOverride | undefined, b: MetaOverride | undefined): boolean => {
		if (a === b) return true;
		if (!a || !b) return !a && !b;
		return (
			a.width === b.width && a.height === b.height && a.fps === b.fps && a.duration === b.duration
		);
	};

	const setSceneMeta = (patch: MetaOverride): void => {
		const prev = store.overlay.meta;
		const merged: MetaOverride = { ...(prev ?? {}), ...patch };
		if (metasEqual(prev, merged)) return;
		commands.push(setOverlayMetaCommand(store.mutate, prev, merged));
	};

	const value: OverlayContextValue = {
		name: () => props.name,
		overlay: store.overlay,
		scene,
		getOverride: store.getOverride,
		setOverride,
		removeOverride,
		addNode,
		deleteNode,
		restoreNode,
		isDeleted: store.isDeleted,
		setSceneMeta,
		structureKey,
		saveState,
		saveError,
	};

	return <OverlayContext.Provider value={value}>{props.children}</OverlayContext.Provider>;
};
