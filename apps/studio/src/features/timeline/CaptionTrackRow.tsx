import { type CaptionClip, type CaptionTrack, createCaptionClip } from "@kut-kut/engine";
import { Trash2, Type } from "lucide-solid";
import { createSignal, For, type JSX, onCleanup, onMount } from "solid-js";
import {
	addCaptionClipCommand,
	moveCaptionClipCommand,
	resizeCaptionClipLeftCommand,
	resizeCaptionClipRightCommand,
	setCaptionTextCommand,
} from "./commands.ts";
import { useTimeline } from "./context.ts";
import { startPointerDrag } from "./interaction.ts";
import { pxToTime, timeToPx } from "./mapping.ts";

export type CaptionTrackRowProps = { track: CaptionTrack };

const CLICK_THRESHOLD_PX = 3;
const MIN_CLIP_SEC = 0.05;
const DEFAULT_NEW_CLIP_SEC = 2;

const labelFor = (track: CaptionTrack): string => `Captions · ${track.id.slice(0, 6)}`;

const CaptionClipView = (props: { trackId: string; clip: CaptionClip }): JSX.Element => {
	const t = useTimeline();
	const [editing, setEditing] = createSignal(false);
	let textarea: HTMLTextAreaElement | undefined;

	const left = (): number => timeToPx(props.clip.start, t.view);
	const widthPx = (): number =>
		Math.max(2, timeToPx(props.clip.end, t.view) - timeToPx(props.clip.start, t.view));
	const selected = (): boolean => t.view.selection.clipId === props.clip.id;

	const beginEdit = (): void => {
		setEditing(true);
		queueMicrotask(() => {
			textarea?.focus();
			textarea?.select();
		});
	};

	const commitEdit = (): void => {
		if (!editing()) return;
		const next = textarea?.value ?? props.clip.text;
		setEditing(false);
		if (next !== props.clip.text) {
			t.push(setCaptionTextCommand(t.mutate, props.trackId, props.clip.id, props.clip.text, next));
		}
	};

	const cancelEdit = (): void => {
		if (!editing()) return;
		setEditing(false);
	};

	const onBodyPointerDown = (e: PointerEvent): void => {
		if (editing()) return;
		e.preventDefault();
		e.stopPropagation();
		const clipStart = props.clip.start;
		const clipDuration = props.clip.end - props.clip.start;
		const duration = t.duration();
		let moved = false;

		startPointerDrag(e, {
			onMove: (dx) => {
				if (!moved && Math.abs(dx) < CLICK_THRESHOLD_PX) return;
				moved = true;
				const deltaSec = dx / t.view.zoom;
				const nextStart = Math.max(0, Math.min(duration - clipDuration, clipStart + deltaSec));
				t.moveCaptionClip(props.trackId, props.clip.id, nextStart);
			},
			onEnd: () => {
				if (!moved) {
					t.selectClip(props.clip.id);
					return;
				}
				t.push(
					moveCaptionClipCommand(
						t.mutate,
						props.trackId,
						props.clip.id,
						clipStart,
						props.clip.start,
					),
				);
			},
		});
	};

	const onLeftHandleDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const clipStart = props.clip.start;
		const clipEnd = props.clip.end;

		startPointerDrag(e, {
			onMove: (dx) => {
				const deltaSec = dx / t.view.zoom;
				let nextStart = clipStart + deltaSec;
				nextStart = Math.max(0, nextStart);
				nextStart = Math.min(clipEnd - MIN_CLIP_SEC, nextStart);
				t.resizeCaptionClipLeft(props.trackId, props.clip.id, nextStart);
			},
			onEnd: () => {
				if (props.clip.start === clipStart) return;
				t.push(
					resizeCaptionClipLeftCommand(
						t.mutate,
						props.trackId,
						props.clip.id,
						clipStart,
						props.clip.start,
					),
				);
			},
		});
	};

	const onRightHandleDown = (e: PointerEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const clipStart = props.clip.start;
		const clipEnd = props.clip.end;
		const duration = t.duration();

		startPointerDrag(e, {
			onMove: (dx) => {
				const deltaSec = dx / t.view.zoom;
				let nextEnd = clipEnd + deltaSec;
				nextEnd = Math.min(duration, nextEnd);
				nextEnd = Math.max(clipStart + MIN_CLIP_SEC, nextEnd);
				t.resizeCaptionClipRight(props.trackId, props.clip.id, nextEnd);
			},
			onEnd: () => {
				if (props.clip.end === clipEnd) return;
				t.push(
					resizeCaptionClipRightCommand(
						t.mutate,
						props.trackId,
						props.clip.id,
						clipEnd,
						props.clip.end,
					),
				);
			},
		});
	};

	const onTextareaKeyDown = (e: KeyboardEvent): void => {
		if (e.key === "Escape") {
			e.preventDefault();
			cancelEdit();
			return;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			commitEdit();
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: clip must host a textarea and drag handles; a real <button> can't nest interactive children
		<div
			class={`tl-caption-clip ${selected() ? "tl-caption-clip--selected" : ""}`}
			style={{ transform: `translateX(${left()}px)`, width: `${widthPx()}px` }}
			role="button"
			tabIndex={-1}
			onPointerDown={onBodyPointerDown}
			onDblClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				t.selectClip(props.clip.id);
				beginEdit();
			}}
			data-clip-id={props.clip.id}
		>
			{editing() ? (
				<textarea
					ref={(el) => {
						textarea = el;
					}}
					class="tl-caption-clip__editor"
					value={props.clip.text}
					onBlur={commitEdit}
					onKeyDown={onTextareaKeyDown}
					spellcheck={false}
					onPointerDown={(e) => e.stopPropagation()}
				/>
			) : (
				<span class="tl-caption-clip__text" title={props.clip.text}>
					{props.clip.text || "(empty caption)"}
				</span>
			)}
			<div
				class="tl-clip__handle tl-clip__handle--left"
				onPointerDown={onLeftHandleDown}
				aria-hidden="true"
			/>
			<div
				class="tl-clip__handle tl-clip__handle--right"
				onPointerDown={onRightHandleDown}
				aria-hidden="true"
			/>
		</div>
	);
};

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export const CaptionTrackRow = (props: CaptionTrackRowProps): JSX.Element => {
	const t = useTimeline();
	let lane!: HTMLDivElement;

	const onRemove = (): void => {
		t.removeCaptionTrack(props.track.id);
	};

	const onLaneDoubleClick = (e: MouseEvent): void => {
		if ((e.target as Element).closest(".tl-caption-clip")) return;
		const rect = lane.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const sceneTime = Math.max(0, pxToTime(px, t.view));
		const duration = t.duration();
		const start = Math.min(sceneTime, Math.max(0, duration - MIN_CLIP_SEC));
		const end = Math.min(duration, start + DEFAULT_NEW_CLIP_SEC);
		if (end - start < MIN_CLIP_SEC) return;
		const clip = createCaptionClip({ start, end, text: "" });
		t.push(addCaptionClipCommand(t.mutate, props.track.id, clip));
		t.selectClip(clip.id);
	};

	const onKeyDown = (e: KeyboardEvent): void => {
		if (isEditableTarget(e.target)) return;
		if (e.key !== "Backspace" && e.key !== "Delete") return;
		const selId = t.view.selection.clipId;
		if (!selId) return;
		const clip = props.track.clips.find((c) => c.id === selId);
		if (!clip) return;
		e.preventDefault();
		t.removeCaptionClip(props.track.id, clip.id);
		t.selectClip(null);
	};

	onMount(() => {
		window.addEventListener("keydown", onKeyDown);
		onCleanup(() => window.removeEventListener("keydown", onKeyDown));
	});

	return (
		<div class="tl-track-row tl-track-row--caption" data-track-id={props.track.id}>
			<div class="tl-track-row__label tl-caption-label">
				<Type size={12} strokeWidth={2.25} aria-hidden="true" />
				<span class="tl-caption-label__title" title={labelFor(props.track)}>
					{labelFor(props.track)}
				</span>
				<button
					type="button"
					class="tl-audio-remove"
					onClick={onRemove}
					aria-label="Remove caption track"
					title="Remove track"
				>
					<Trash2 size={13} strokeWidth={2.25} aria-hidden="true" />
				</button>
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: author-only editor surface, not exposed to end users */}
			<div class="tl-track-row__lane tl-caption-lane" ref={lane} onDblClick={onLaneDoubleClick}>
				<For each={props.track.clips}>
					{(clip) => <CaptionClipView trackId={props.track.id} clip={clip} />}
				</For>
			</div>
		</div>
	);
};
