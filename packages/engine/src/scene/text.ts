import { type Property, prop } from "../reactive/property.ts";
import { NodeType } from "./node-type.ts";
import type { Transform, Vec3 } from "./transform.ts";

export const TextAlign = {
	Left: "left",
	Center: "center",
	Right: "right",
} as const;

export type TextAlign = (typeof TextAlign)[keyof typeof TextAlign];

export type Text = {
	readonly id: string;
	readonly type: typeof NodeType.Text;
	name: string;
	transform: Transform;
	text: Property<string>;
	fontSize: Property<number>;
	fontFamily: Property<string>;
	color: Property<Vec3>;
	align: Property<TextAlign>;
};

export type CreateTextOptions = {
	id?: string;
	name?: string;
	transform: Transform;
	text?: string;
	fontSize?: number;
	fontFamily?: string;
	color?: Vec3;
	align?: TextAlign;
};

export const createText = (options: CreateTextOptions): Text => ({
	id: options.id ?? crypto.randomUUID(),
	type: NodeType.Text,
	name: options.name ?? "Text",
	transform: options.transform,
	text: prop(options.text ?? "Label"),
	fontSize: prop(options.fontSize ?? 32),
	fontFamily: prop(options.fontFamily ?? "sans-serif"),
	color: prop<Vec3>(options.color ?? [1, 1, 1]),
	align: prop<TextAlign>(options.align ?? TextAlign.Center),
});
