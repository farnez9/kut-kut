import type { Vec3 } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { NumberInput } from "./NumberInput.tsx";

export type Vec3InputProps = {
	value: Vec3;
	onCommit: (value: Vec3) => void;
	step?: number;
	axisLabels?: readonly [string, string, string];
};

const DEFAULT_LABELS = ["x", "y", "z"] as const;

export const Vec3Input = (props: Vec3InputProps): JSX.Element => {
	const labels = (): readonly [string, string, string] => props.axisLabels ?? DEFAULT_LABELS;

	const commitAt = (i: 0 | 1 | 2, v: number): void => {
		const next: Vec3 = [props.value[0], props.value[1], props.value[2]];
		next[i] = v;
		props.onCommit(next);
	};

	return (
		<div class="inspector__vec3">
			<div class="inspector__vec3-cell">
				<span class="inspector__axis">{labels()[0]}</span>
				<NumberInput
					value={props.value[0]}
					onCommit={(v) => commitAt(0, v)}
					step={props.step}
					label={labels()[0]}
				/>
			</div>
			<div class="inspector__vec3-cell">
				<span class="inspector__axis">{labels()[1]}</span>
				<NumberInput
					value={props.value[1]}
					onCommit={(v) => commitAt(1, v)}
					step={props.step}
					label={labels()[1]}
				/>
			</div>
			<div class="inspector__vec3-cell">
				<span class="inspector__axis">{labels()[2]}</span>
				<NumberInput
					value={props.value[2]}
					onCommit={(v) => commitAt(2, v)}
					step={props.step}
					label={labels()[2]}
				/>
			</div>
		</div>
	);
};
