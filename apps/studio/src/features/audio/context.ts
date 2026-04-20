import type { Peaks } from "@kut-kut/engine";
import { type Accessor, createContext, useContext } from "solid-js";

export type DecodeState = "pending" | "ready" | "error";

export type AudioContextValue = {
	buffers: Accessor<Map<string, AudioBuffer>>;
	peaks: Accessor<Map<string, Peaks>>;
	decodeState: Accessor<Map<string, DecodeState>>;
	importFile: (file: File) => Promise<void>;
	importState: Accessor<"idle" | "importing" | "error">;
	importError: Accessor<Error | null>;
	context: Accessor<AudioContext | null>;
	ensureContext: () => AudioContext;
};

export const AudioContext = createContext<AudioContextValue>();

export const useAudio = (): AudioContextValue => {
	const ctx = useContext(AudioContext);
	if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
	return ctx;
};
