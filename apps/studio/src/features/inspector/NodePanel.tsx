import type { Node, Transform2D, Transform3D, Vec3 } from "@kut-kut/engine";
import { NodeType, TransformKind } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { useCommands } from "../../lib/commands/index.ts";
import { useOverlay } from "../overlay/index.ts";
import { usePlayback } from "../playback/index.ts";
import { useRecord } from "../record/index.ts";
import { useTimeline } from "../timeline/index.ts";
import { NumberInput } from "./editors/NumberInput.tsx";
import { Vec3Input } from "./editors/Vec3Input.tsx";
import { commitPropertyEdit, findNumberTrackCoverage, type RouteDeps } from "./routeCommit.ts";

export type NodeSelection = { node: Node; nodePath: string[] };

const typeLabel = (type: Node["type"]): string => {
	switch (type) {
		case NodeType.Rect:
			return "Rect";
		case NodeType.Box:
			return "Box";
		case NodeType.Group:
			return "Group";
		case NodeType.Layer2D:
			return "2D Layer";
		case NodeType.Layer3D:
			return "3D Layer";
	}
};

const Row = (props: { label: string; value: string | number }): JSX.Element => (
	<div class="inspector__row">
		<span class="inspector__label">{props.label}</span>
		<span class="inspector__value">{props.value}</span>
	</div>
);

const useRouteDeps = (): RouteDeps => ({
	overlay: useOverlay(),
	timeline: useTimeline(),
	record: useRecord(),
	commands: useCommands(),
	playback: usePlayback(),
});

const RecIndicator = (props: { active: boolean }): JSX.Element => (
	<Show when={props.active}>
		<span class="inspector__rec" title="Will record keyframe">
			● REC
		</span>
	</Show>
);

const Field2D = (props: {
	nodePath: string[];
	property: string;
	transform: Transform2D;
	label: string;
	accessor: (t: Transform2D) => { get: () => number };
	step?: number;
}): JSX.Element => {
	const deps = useRouteDeps();
	const effective = (): number => {
		const stored = deps.overlay.getOverride(props.nodePath, props.property);
		if (typeof stored === "number") return stored;
		return props.accessor(props.transform).get();
	};
	const recordHot = (): boolean => {
		if (!deps.record.active()) return false;
		return (
			findNumberTrackCoverage(
				deps.timeline.timeline,
				props.nodePath,
				props.property,
				deps.playback.time(),
			) !== null
		);
	};
	return (
		<div class="inspector__field">
			<span class="inspector__label">
				{props.label}
				<RecIndicator active={recordHot()} />
			</span>
			<NumberInput
				value={effective()}
				step={props.step}
				label={props.label}
				onCommit={(v) => commitPropertyEdit(deps, props.nodePath, props.property, v)}
			/>
		</div>
	);
};

const FieldOpacity3D = (props: { nodePath: string[]; transform: Transform3D }): JSX.Element => {
	const deps = useRouteDeps();
	const property = "transform.opacity";
	const effective = (): number => {
		const stored = deps.overlay.getOverride(props.nodePath, property);
		if (typeof stored === "number") return stored;
		return props.transform.opacity.get();
	};
	const recordHot = (): boolean => {
		if (!deps.record.active()) return false;
		return (
			findNumberTrackCoverage(
				deps.timeline.timeline,
				props.nodePath,
				property,
				deps.playback.time(),
			) !== null
		);
	};
	return (
		<div class="inspector__field">
			<span class="inspector__label">
				opacity
				<RecIndicator active={recordHot()} />
			</span>
			<NumberInput
				value={effective()}
				step={0.05}
				label="opacity"
				onCommit={(v) => commitPropertyEdit(deps, props.nodePath, property, v)}
			/>
		</div>
	);
};

const FieldVec3 = (props: {
	nodePath: string[];
	property: string;
	initial: () => Vec3;
	label: string;
	step?: number;
}): JSX.Element => {
	const deps = useRouteDeps();
	const effective = (): Vec3 => {
		const stored = deps.overlay.getOverride(props.nodePath, props.property);
		if (Array.isArray(stored)) return stored;
		return props.initial();
	};
	return (
		<div class="inspector__field inspector__field--vec3">
			<span class="inspector__label">{props.label}</span>
			<Vec3Input
				value={effective()}
				step={props.step}
				onCommit={(v) => commitPropertyEdit(deps, props.nodePath, props.property, v)}
			/>
		</div>
	);
};

const Transform2DEditor = (props: { nodePath: string[]; transform: Transform2D }): JSX.Element => (
	<>
		<div class="inspector__section">Transform (2D)</div>
		<Field2D
			nodePath={props.nodePath}
			property="transform.x"
			transform={props.transform}
			label="x"
			accessor={(t) => t.x}
		/>
		<Field2D
			nodePath={props.nodePath}
			property="transform.y"
			transform={props.transform}
			label="y"
			accessor={(t) => t.y}
		/>
		<Field2D
			nodePath={props.nodePath}
			property="transform.rotation"
			transform={props.transform}
			label="rotation (rad)"
			accessor={(t) => t.rotation}
			step={0.01}
		/>
		<Field2D
			nodePath={props.nodePath}
			property="transform.scaleX"
			transform={props.transform}
			label="scaleX"
			accessor={(t) => t.scaleX}
			step={0.05}
		/>
		<Field2D
			nodePath={props.nodePath}
			property="transform.scaleY"
			transform={props.transform}
			label="scaleY"
			accessor={(t) => t.scaleY}
			step={0.05}
		/>
		<Field2D
			nodePath={props.nodePath}
			property="transform.opacity"
			transform={props.transform}
			label="opacity"
			accessor={(t) => t.opacity}
			step={0.05}
		/>
	</>
);

const Transform3DEditor = (props: { nodePath: string[]; transform: Transform3D }): JSX.Element => (
	<>
		<div class="inspector__section">Transform (3D)</div>
		<FieldVec3
			nodePath={props.nodePath}
			property="transform.position"
			label="position"
			initial={() => props.transform.position.get()}
		/>
		<FieldVec3
			nodePath={props.nodePath}
			property="transform.rotation"
			label="rotation (rad)"
			step={0.01}
			initial={() => props.transform.rotation.get()}
		/>
		<FieldVec3
			nodePath={props.nodePath}
			property="transform.scale"
			label="scale"
			step={0.05}
			initial={() => props.transform.scale.get()}
		/>
		<FieldOpacity3D nodePath={props.nodePath} transform={props.transform} />
	</>
);

export const NodePanel = (props: { selection: NodeSelection }): JSX.Element => {
	const node = (): Node => props.selection.node;
	const nodePath = (): string[] => props.selection.nodePath;
	const pathLabel = (): string => nodePath().join(" › ");
	const is3D = (): boolean => node().transform.kind === TransformKind.ThreeD;

	return (
		<div class="inspector__body">
			<div class="inspector__section">Node</div>
			<Row label="Name" value={node().name} />
			<Row label="Type" value={typeLabel(node().type)} />
			<Row label="Path" value={pathLabel()} />
			<Show
				when={is3D()}
				fallback={
					<Transform2DEditor nodePath={nodePath()} transform={node().transform as Transform2D} />
				}
			>
				<Transform3DEditor nodePath={nodePath()} transform={node().transform as Transform3D} />
			</Show>
		</div>
	);
};
