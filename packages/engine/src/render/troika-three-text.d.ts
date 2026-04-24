declare module "troika-three-text" {
	import type { Color, Mesh } from "three";

	export class Text extends Mesh {
		text: string;
		fontSize: number;
		color: Color | number | string;
		anchorX: number | "left" | "center" | "right";
		anchorY: number | "top" | "middle" | "bottom" | "top-baseline" | "bottom-baseline";
		textAlign: "left" | "center" | "right" | "justify";
		sync(callback?: () => void): void;
		dispose(): void;
	}
}
