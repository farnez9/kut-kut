export const decodeAudio = (ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> =>
	ctx.decodeAudioData(data);
