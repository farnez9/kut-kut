const pad = (n: number, width = 2): string => n.toString().padStart(width, "0");

export const makeExportFilename = (now: Date, project: string): string => {
	const stamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
	].join("");
	const safeProject =
		project
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "export";
	return `${safeProject}-${stamp}.mp4`;
};
