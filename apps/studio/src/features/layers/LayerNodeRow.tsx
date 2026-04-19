import { NodeType, type TransformKind } from "@kut-kut/engine";
import { Box, ChevronRight, Folder, Layers, RotateCcw, Square, Trash2 } from "lucide-solid";
import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { sameNodePath, useOverlay } from "../overlay/index.ts";
import { useTimeline } from "../timeline/index.ts";
import { AddChildMenu } from "./AddChildMenu.tsx";
import type { LayerTreeNode } from "./derive.ts";
import { pickUniqueName } from "./derive.ts";

const INDENT_PX = 14;

const iconFor = (type: LayerTreeNode["node"]["type"]): JSX.Element => {
	switch (type) {
		case NodeType.Layer2D:
		case NodeType.Layer3D:
			return <Layers size={13} strokeWidth={2} aria-hidden="true" />;
		case NodeType.Group:
			return <Folder size={13} strokeWidth={2} aria-hidden="true" />;
		case NodeType.Rect:
			return <Square size={13} strokeWidth={2} aria-hidden="true" />;
		case NodeType.Box:
			return <Box size={13} strokeWidth={2} aria-hidden="true" />;
	}
};

const canAddChildren = (type: LayerTreeNode["node"]["type"]): boolean =>
	type === NodeType.Group || type === NodeType.Layer2D || type === NodeType.Layer3D;

export type LayerNodeRowProps = {
	entry: LayerTreeNode;
	depth: number;
};

export const LayerNodeRow = (props: LayerNodeRowProps): JSX.Element => {
	const timeline = useTimeline();
	const overlay = useOverlay();
	const [expanded, setExpanded] = createSignal(true);
	const [menuOpen, setMenuOpen] = createSignal(false);

	const selected = (): boolean => {
		const selPath = timeline.view.selection.nodePath;
		if (!selPath) return false;
		return sameNodePath(selPath, props.entry.nodePath);
	};

	const hasKids = (): boolean => props.entry.children.length > 0;
	const select = (): void => timeline.selectNode(props.entry.nodePath);

	const handleAdd = (kind: "rect" | "box" | "group"): void => {
		const siblingNames = props.entry.children.map((c) => c.node.name);
		const base = kind === "rect" ? "Rect" : kind === "box" ? "Box" : "Group";
		const name = pickUniqueName(siblingNames, base);
		overlay.addNode({ parentPath: props.entry.nodePath, name, kind });
		timeline.selectNode([...props.entry.nodePath, name]);
	};

	const parentKind = (): TransformKind => props.entry.node.transform.kind;

	return (
		<li class="layer-row-item">
			<div
				class="layer-row"
				classList={{
					"layer-row--selected": selected(),
					"layer-row--deleted": props.entry.deleted,
					"layer-row--inactive": props.entry.deletedAncestor && !props.entry.deleted,
					"layer-row--added": props.entry.source === "added",
				}}
				style={{ "padding-left": `${props.depth * INDENT_PX + 6}px` }}
			>
				<button
					type="button"
					class="layer-row__caret"
					classList={{
						"layer-row__caret--open": expanded(),
						"layer-row__caret--empty": !hasKids(),
					}}
					aria-label={expanded() ? "Collapse" : "Expand"}
					disabled={!hasKids()}
					onClick={(e) => {
						e.stopPropagation();
						if (hasKids()) setExpanded((v) => !v);
					}}
				>
					<Show when={hasKids()}>
						<ChevronRight size={12} strokeWidth={2.25} aria-hidden="true" />
					</Show>
				</button>
				<button
					type="button"
					class="layer-row__main"
					onClick={select}
					title={props.entry.nodePath.join(" › ")}
				>
					<span class="layer-row__icon" aria-hidden="true">
						{iconFor(props.entry.node.type)}
					</span>
					<span class="layer-row__name">{props.entry.node.name}</span>
				</button>
				<div class="layer-row__actions">
					<Show when={canAddChildren(props.entry.node.type) && !props.entry.deletedAncestor}>
						<div class="layer-row__action-wrap">
							<button
								type="button"
								class="layer-row__action"
								aria-label="Add child"
								title="Add child"
								onClick={(e) => {
									e.stopPropagation();
									setMenuOpen(true);
								}}
							>
								+
							</button>
							<Show when={menuOpen()}>
								<AddChildMenu
									parentKind={parentKind()}
									onPick={handleAdd}
									onClose={() => setMenuOpen(false)}
								/>
							</Show>
						</div>
					</Show>
					<Show
						when={props.entry.deleted}
						fallback={
							<Show when={!props.entry.deletedAncestor}>
								<button
									type="button"
									class="layer-row__action layer-row__action--danger"
									aria-label="Delete"
									title="Delete"
									onClick={(e) => {
										e.stopPropagation();
										overlay.deleteNode(props.entry.nodePath);
									}}
								>
									<Trash2 size={12} strokeWidth={2} aria-hidden="true" />
								</button>
							</Show>
						}
					>
						<button
							type="button"
							class="layer-row__action"
							aria-label="Restore"
							title="Restore"
							onClick={(e) => {
								e.stopPropagation();
								overlay.restoreNode(props.entry.nodePath);
							}}
						>
							<RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
						</button>
					</Show>
				</div>
			</div>
			<Show when={expanded() && hasKids()}>
				<ul class="layer-row__children">
					<For each={props.entry.children}>
						{(child) => <LayerNodeRow entry={child} depth={props.depth + 1} />}
					</For>
				</ul>
			</Show>
		</li>
	);
};
