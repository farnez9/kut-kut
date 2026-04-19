import {
	createBox,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	type Scene,
} from "@kut-kut/engine";

export default (): Scene => {
	const rect = createRect({
		name: "Hero",
		transform: { scaleX: 180, scaleY: 180 },
		color: [1, 0.42, 0.1],
	});
	const box = createBox({
		name: "Hero",
		transform: {
			position: [0, 0, 700],
			rotation: [0.5, 0.7, 0],
			scale: [320, 320, 320],
		},
		color: [0.22, 0.62, 1],
	});
	return createScene({
		meta: { name: "example", width: 1920, height: 1080, fps: 30, duration: 6 },
		layers: [
			createLayer2D({ name: "2D", children: [rect] }),
			createLayer3D({ name: "3D", children: [box] }),
		],
	});
};
