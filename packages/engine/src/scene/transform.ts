import { type Property, prop } from "../reactive/property.ts";

export const TransformKind = {
	TwoD: "2d",
	ThreeD: "3d",
} as const;

export type TransformKind = (typeof TransformKind)[keyof typeof TransformKind];

export type Vec3 = [number, number, number];

export type Transform2D = {
	readonly kind: typeof TransformKind.TwoD;
	readonly x: Property<number>;
	readonly y: Property<number>;
	readonly rotation: Property<number>;
	readonly scaleX: Property<number>;
	readonly scaleY: Property<number>;
	readonly opacity: Property<number>;
};

export type Transform3D = {
	readonly kind: typeof TransformKind.ThreeD;
	readonly position: Property<Vec3>;
	readonly rotation: Property<Vec3>;
	readonly scale: Property<Vec3>;
	readonly opacity: Property<number>;
};

export type Transform = Transform2D | Transform3D;

export type Transform2DInit = {
	x?: number;
	y?: number;
	rotation?: number;
	scaleX?: number;
	scaleY?: number;
	opacity?: number;
};

export type Transform3DInit = {
	position?: Vec3;
	rotation?: Vec3;
	scale?: Vec3;
	opacity?: number;
};

export const createTransform2D = (init: Transform2DInit = {}): Transform2D => ({
	kind: TransformKind.TwoD,
	x: prop(init.x ?? 0),
	y: prop(init.y ?? 0),
	rotation: prop(init.rotation ?? 0),
	scaleX: prop(init.scaleX ?? 1),
	scaleY: prop(init.scaleY ?? 1),
	opacity: prop(init.opacity ?? 1),
});

export const createTransform3D = (init: Transform3DInit = {}): Transform3D => ({
	kind: TransformKind.ThreeD,
	position: prop(init.position ?? [0, 0, 0]),
	rotation: prop(init.rotation ?? [0, 0, 0]),
	scale: prop(init.scale ?? [1, 1, 1]),
	opacity: prop(init.opacity ?? 1),
});
