import { For, type JSX, Show, useContext } from "solid-js";
import { OverlayContext } from "../overlay/context.ts";
import { ASPECT_PRESETS, type AspectPresetId, presetForSize } from "./presets.ts";

export const AspectPresetToggle = (): JSX.Element => {
	const overlay = useContext(OverlayContext);

	return (
		<Show when={overlay}>
			{(ctx) => {
				const active = (): AspectPresetId | null => {
					const { width, height } = ctx().scene().meta;
					return presetForSize(width, height);
				};
				const onPick = (id: AspectPresetId): void => {
					const preset = ASPECT_PRESETS.find((p) => p.id === id);
					if (!preset) return;
					ctx().setSceneMeta({ width: preset.width, height: preset.height });
				};
				return (
					<fieldset class="aspect-toggle" aria-label="Scene aspect ratio">
						<For each={ASPECT_PRESETS}>
							{(preset) => (
								<button
									type="button"
									class={`aspect-toggle__btn ${active() === preset.id ? "aspect-toggle__btn--on" : ""}`}
									aria-pressed={active() === preset.id}
									onClick={() => onPick(preset.id)}
									title={`${preset.label} — ${preset.width}×${preset.height}`}
								>
									{preset.label}
								</button>
							)}
						</For>
					</fieldset>
				);
			}}
		</Show>
	);
};
