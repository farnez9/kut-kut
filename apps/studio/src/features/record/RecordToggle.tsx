import { Circle } from "lucide-solid";
import type { JSX } from "solid-js";
import { useRecord } from "./context.ts";

export const RecordToggle = (): JSX.Element => {
	const record = useRecord();
	const active = (): boolean => record.active();

	return (
		<button
			type="button"
			class={`record-toggle ${active() ? "record-toggle--active" : ""}`}
			aria-pressed={active()}
			aria-label={active() ? "Disable record mode (R)" : "Enable record mode (R)"}
			title={active() ? "Record · on (R)" : "Record · off (R)"}
			onClick={record.toggle}
		>
			<Circle
				size={10}
				strokeWidth={2.5}
				class="record-toggle__dot"
				aria-hidden="true"
				fill={active() ? "currentColor" : "transparent"}
			/>
			<span class="record-toggle__label">REC</span>
		</button>
	);
};
