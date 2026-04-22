const EXTENSION_BY_CONTAINER: ReadonlyArray<[RegExp, string]> = [
	[/^audio\/mpeg/i, "mp3"],
	[/^audio\/mp3/i, "mp3"],
	[/^audio\/wav/i, "wav"],
	[/^audio\/wave/i, "wav"],
	[/^audio\/webm/i, "webm"],
	[/^audio\/mp4/i, "m4a"],
	[/^audio\/m4a/i, "m4a"],
	[/^audio\/ogg/i, "ogg"],
];

export const extensionForMime = (mime: string): string => {
	const head = mime.split(";")[0]?.trim() ?? "";
	for (const [pattern, ext] of EXTENSION_BY_CONTAINER) {
		if (pattern.test(head)) return ext;
	}
	return "bin";
};
