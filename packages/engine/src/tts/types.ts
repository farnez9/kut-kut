export type TtsRequest = {
	text: string;
	voiceId?: string;
};

export type TtsResult = {
	bytes: ArrayBuffer;
	mime: string;
};

export type TtsVoice = {
	id: string;
	label: string;
};

export type TtsPreviewOptions = {
	onEnded?: () => void;
	onError?: (err: Error) => void;
};

export type TtsWarmUpProgress = {
	loaded: number;
	total: number;
};

export type TtsProvider = {
	readonly id: string;
	readonly label: string;
	readonly canPreview: boolean;
	readonly canSynthesize: boolean;
	voices(): Promise<TtsVoice[]>;
	preview?(req: TtsRequest, options?: TtsPreviewOptions): () => void;
	synthesize?(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult>;
	warmUp?(onProgress?: (progress: TtsWarmUpProgress) => void): Promise<void>;
};
