import { Download } from "lucide-solid";
import { createSignal, type JSX, Show } from "solid-js";
import { useProject } from "../project/index.ts";
import { ExportDialog } from "./ExportDialog.tsx";

export const ExportButton = (): JSX.Element => {
	const project = useProject();
	const [open, setOpen] = createSignal(false);

	return (
		<div class="export-button-wrap">
			<button
				type="button"
				class={`tl-import-btn ${open() ? "tl-import-btn--on" : ""}`}
				onClick={() => setOpen((o) => !o)}
				disabled={!project.bundle()}
				title="Export mp4"
				aria-expanded={open()}
			>
				<Download size={12} strokeWidth={2.25} aria-hidden="true" />
				<span>Export</span>
			</button>
			<Show when={open()}>
				<ExportDialog onClose={() => setOpen(false)} />
			</Show>
		</div>
	);
};
