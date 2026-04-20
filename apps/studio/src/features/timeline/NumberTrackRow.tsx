import { isTrackTargetByPath, type NumberTrack } from "@kut-kut/engine";
import { For, type JSX } from "solid-js";
import { Clip } from "./Clip.tsx";

export type NumberTrackRowProps = {
	track: NumberTrack;
};

const labelFor = (track: NumberTrack): string => {
	const target = track.target;
	const nodeLabel = isTrackTargetByPath(target) ? target.nodePath.join(" › ") : target.nodeId;
	return `${nodeLabel} · ${target.property}`;
};

export const NumberTrackRow = (props: NumberTrackRowProps): JSX.Element => {
	return (
		<div class="tl-track-row" data-track-id={props.track.id}>
			<div class="tl-track-row__label">{labelFor(props.track)}</div>
			<div class="tl-track-row__lane">
				<For each={props.track.clips}>
					{(clip) => <Clip trackId={props.track.id} clip={clip} />}
				</For>
			</div>
		</div>
	);
};
