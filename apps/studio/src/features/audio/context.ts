import type { Peaks } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";

export type DecodeState = "pending" | "ready" | "error";

export type RecordState = "idle" | "requesting" | "recording" | "processing" | "error";

export type CleanState = "idle" | "working" | "done" | "error";

export type AudioContextValue = {
	buffers: Accessor<Map<string, AudioBuffer>>;
	peaks: Accessor<Map<string, Peaks>>;
	decodeState: Accessor<Map<string, DecodeState>>;
	importFile: (file: File) => Promise<void>;
	ingestAudioFile: (file: File, startAt: number) => Promise<void>;
	importState: Accessor<"idle" | "importing" | "error">;
	importError: Accessor<Error | null>;
	recordSupported: () => boolean;
	recordState: Accessor<RecordState>;
	recordError: Accessor<Error | null>;
	recordElapsed: Accessor<number>;
	startRecording: () => Promise<void>;
	stopRecording: () => Promise<void>;
	cancelRecording: () => void;
	cleanState: Accessor<CleanState>;
	cleanMessage: Accessor<string>;
	cleanAssets: () => Promise<void>;
	context: Accessor<AudioContext | null>;
	ensureContext: () => AudioContext;
};

export const AudioContext = createContext<AudioContextValue>();

export const useAudio = (): AudioContextValue => {
	const ctx = useContext(AudioContext);
	if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
	return ctx;
};
