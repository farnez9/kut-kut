import {
	createBox,
	createClip,
	createKeyframe,
	createLayer2D,
	createLayer3D,
	createRect,
	createScene,
	createTimeline,
	createTrack,
	EasingName,
	type Scene,
	type Timeline,
} from "@kut-kut/engine";

export type DemoSceneBundle = {
	scene: Scene;
	timeline: Timeline;
	duration: number;
	/**
	 * Called every frame after `applyTimeline`. Handles what the NumberTrack
	 * schema can't (Vec3 sub-component animation, container centering on
	 * resize). The preview passes current container dimensions in CSS pixels.
	 */
	drive: (time: number, width: number, height: number) => void;
};

const TWO_PI = Math.PI * 2;

export const createDemoScene = (): DemoSceneBundle => {
	const duration = 4;

	const rect = createRect({
		name: "Demo Rect",
		transform: { scaleX: 180, scaleY: 180 },
		color: [1, 0.42, 0.1],
	});

	const box = createBox({
		name: "Demo Box",
		transform: { position: [0, 0, -3], scale: [1.3, 1.3, 1.3] },
		color: [0.22, 0.62, 1],
	});

	const layer2d = createLayer2D({ name: "2D", children: [rect] });
	const layer3d = createLayer3D({ name: "3D", children: [box] });

	const scene = createScene({
		meta: { name: "demo", width: 1920, height: 1080, fps: 30, duration },
		layers: [layer2d, layer3d],
	});

	const timeline = createTimeline({
		tracks: [
			createTrack({
				target: { nodeId: rect.id, property: "transform.rotation" },
				clips: [
					createClip({
						start: 0,
						end: duration,
						keyframes: [
							createKeyframe({ time: 0, value: 0, easing: EasingName.Linear }),
							createKeyframe({ time: duration, value: TWO_PI, easing: EasingName.Linear }),
						],
					}),
				],
			}),
			createTrack({
				target: { nodeId: rect.id, property: "transform.x" },
				clips: [
					createClip({
						start: 0,
						end: duration,
						keyframes: [
							createKeyframe({ time: 0, value: -280, easing: EasingName.EaseInOutCubic }),
							createKeyframe({
								time: duration / 2,
								value: 280,
								easing: EasingName.EaseInOutCubic,
							}),
							createKeyframe({ time: duration, value: -280, easing: EasingName.Linear }),
						],
					}),
				],
			}),
		],
	});

	const drive = (time: number, width: number, height: number): void => {
		if (width > 0 && height > 0) {
			layer2d.transform.x.set(width / 2);
			layer2d.transform.y.set(height / 2);
		}
		const t = time / duration;
		box.transform.rotation.set([t * TWO_PI * 0.5, t * TWO_PI, 0]);
		box.transform.position.set([Math.sin(t * TWO_PI) * 1.4, 0, -3]);
	};

	return { scene, timeline, duration, drive };
};
