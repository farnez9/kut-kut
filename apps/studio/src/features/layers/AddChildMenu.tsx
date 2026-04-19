import type { NodeKind } from "@kut-kut/engine";
import { TransformKind } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { For, onCleanup, onMount } from "solid-js";

export type AddChildMenuProps = {
	parentKind: TransformKind;
	onPick: (kind: NodeKind) => void;
	onClose: () => void;
};

const kindsFor = (parentKind: TransformKind): { kind: NodeKind; label: string }[] =>
	parentKind === TransformKind.TwoD
		? [
				{ kind: "rect", label: "Rect" },
				{ kind: "group", label: "Group" },
			]
		: [
				{ kind: "box", label: "Box" },
				{ kind: "group", label: "Group" },
			];

export const AddChildMenu = (props: AddChildMenuProps): JSX.Element => {
	let root!: HTMLDivElement;

	const onDocClick = (e: MouseEvent): void => {
		if (!(e.target instanceof Node)) return;
		if (!root.contains(e.target)) props.onClose();
	};
	const onKey = (e: KeyboardEvent): void => {
		if (e.key === "Escape") props.onClose();
	};

	onMount(() => {
		document.addEventListener("mousedown", onDocClick, { capture: true });
		document.addEventListener("keydown", onKey);
	});
	onCleanup(() => {
		document.removeEventListener("mousedown", onDocClick, { capture: true });
		document.removeEventListener("keydown", onKey);
	});

	return (
		<div ref={root} class="add-child-menu" role="menu">
			<For each={kindsFor(props.parentKind)}>
				{(opt) => (
					<button
						type="button"
						class="add-child-menu__item"
						role="menuitem"
						onClick={() => {
							props.onPick(opt.kind);
							props.onClose();
						}}
					>
						{opt.label}
					</button>
				)}
			</For>
		</div>
	);
};
