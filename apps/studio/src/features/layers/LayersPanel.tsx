import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { useOverlay } from "../overlay/index.ts";
import { useProject } from "../project/index.ts";
import { deriveLayerTree } from "./derive.ts";
import { LayerNodeRow } from "./LayerNodeRow.tsx";

export const LayersPanel = (): JSX.Element => {
	const project = useProject();
	const overlay = useOverlay();

	const tree = createMemo(() => {
		const scene = project.bundle()?.scene;
		if (!scene) return [];
		return deriveLayerTree(scene, overlay.overlay);
	});

	return (
		<div class="layers">
			<Show
				when={tree().length > 0}
				fallback={<p class="layers__empty">No layers in this scene.</p>}
			>
				<ul class="layers__tree">
					<For each={tree()}>{(entry) => <LayerNodeRow entry={entry} depth={0} />}</For>
				</ul>
			</Show>
		</div>
	);
};
