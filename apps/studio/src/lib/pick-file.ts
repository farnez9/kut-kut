export const pickFile = (accept: string): Promise<File | null> =>
	new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.style.display = "none";
		document.body.appendChild(input);
		const cleanup = (): void => {
			input.remove();
		};
		input.addEventListener(
			"change",
			() => {
				const file = input.files?.[0] ?? null;
				cleanup();
				resolve(file);
			},
			{ once: true },
		);
		input.addEventListener("cancel", () => {
			cleanup();
			resolve(null);
		});
		input.click();
	});
