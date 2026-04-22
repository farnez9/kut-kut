import { createKokoroProvider, type TtsProvider } from "@kut-kut/engine";

const cache: readonly TtsProvider[] = [createKokoroProvider()];

export const getTtsProviders = (): readonly TtsProvider[] => cache;

export const findTtsProvider = (id: string): TtsProvider | undefined =>
	cache.find((p) => p.id === id);
