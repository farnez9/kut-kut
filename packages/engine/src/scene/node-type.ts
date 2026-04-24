export const NodeType = {
	Group: "group",
	Layer2D: "layer-2d",
	Layer3D: "layer-3d",
	Rect: "rect",
	Box: "box",
	Text: "text",
	Circle: "circle",
	Line: "line",
	Image: "image",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];
