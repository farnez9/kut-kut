import { type Clip, isTrackTargetByPath, type Keyframe, type Track } from "@kut-kut/engine";
import type { JSX } from "solid-js";
import { Match, Switch } from "solid-js";
import { parseKeyframeId, useTimeline } from "../timeline/index.ts";

type ClipSelection = { track: Track; clip: Clip<number> };
type KeyframeSelection = {
	track: Track;
	clip: Clip<number>;
	keyframe: Keyframe<number>;
	index: number;
};

const findClip = (tracks: readonly Track[], clipId: string): ClipSelection | null => {
	for (const track of tracks) {
		const clip = track.clips.find((c) => c.id === clipId);
		if (clip) return { track, clip };
	}
	return null;
};

const targetLabel = (track: Track): string => {
	const target = track.target;
	const node = isTrackTargetByPath(target) ? target.nodePath.join(" › ") : target.nodeId;
	return `${node} · ${target.property}`;
};

const Row = (props: { label: string; value: string | number }): JSX.Element => (
	<div class="inspector__row">
		<span class="inspector__label">{props.label}</span>
		<span class="inspector__value">{props.value}</span>
	</div>
);

const ClipPanel = (props: { selection: ClipSelection }): JSX.Element => (
	<div class="inspector__body">
		<div class="inspector__section">Clip</div>
		<Row label="ID" value={props.selection.clip.id} />
		<Row label="Target" value={targetLabel(props.selection.track)} />
		<Row label="Start" value={`${props.selection.clip.start.toFixed(3)} s`} />
		<Row label="End" value={`${props.selection.clip.end.toFixed(3)} s`} />
		<Row
			label="Duration"
			value={`${(props.selection.clip.end - props.selection.clip.start).toFixed(3)} s`}
		/>
		<Row label="Keyframes" value={props.selection.clip.keyframes.length} />
	</div>
);

const KeyframePanel = (props: { selection: KeyframeSelection }): JSX.Element => {
	const absoluteTime = (): number => props.selection.clip.start + props.selection.keyframe.time;
	return (
		<div class="inspector__body">
			<div class="inspector__section">Keyframe</div>
			<Row label="Index" value={props.selection.index} />
			<Row label="Absolute t" value={`${absoluteTime().toFixed(3)} s`} />
			<Row label="Local t" value={`${props.selection.keyframe.time.toFixed(3)} s`} />
			<Row label="Value" value={props.selection.keyframe.value} />
			<Row label="Easing" value={props.selection.keyframe.easing} />
			<Row label="Clip" value={props.selection.clip.id} />
		</div>
	);
};

const EmptyPanel = (): JSX.Element => (
	<p class="panel-body">Select a clip or keyframe to inspect.</p>
);

export const Inspector = (): JSX.Element => {
	const t = useTimeline();

	const keyframeSelection = (): KeyframeSelection | null => {
		const id = t.view.selection.keyframeId;
		if (!id) return null;
		const parsed = parseKeyframeId(id);
		if (!parsed) return null;
		const found = findClip(t.timeline.tracks, parsed.clipId);
		if (!found) return null;
		const keyframe = found.clip.keyframes[parsed.index];
		if (!keyframe) return null;
		return { ...found, keyframe, index: parsed.index };
	};

	const clipSelection = (): ClipSelection | null => {
		const id = t.view.selection.clipId;
		if (!id) return null;
		return findClip(t.timeline.tracks, id);
	};

	return (
		<Switch fallback={<EmptyPanel />}>
			<Match when={keyframeSelection()} keyed>
				{(sel) => <KeyframePanel selection={sel} />}
			</Match>
			<Match when={clipSelection()} keyed>
				{(sel) => <ClipPanel selection={sel} />}
			</Match>
		</Switch>
	);
};

export const InspectorHint = (): JSX.Element => <span class="panel-head__hint">⌘Z / ⌘⇧Z</span>;
