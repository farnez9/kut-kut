import type { Box } from "./box.ts";
import type { Circle } from "./circle.ts";
import type { Group } from "./group.ts";
import type { Image } from "./image.ts";
import type { Layer } from "./layer.ts";
import type { Line } from "./line.ts";
import type { Rect } from "./rect.ts";
import type { Text } from "./text.ts";

export type Node = Group | Layer | Rect | Box | Text | Circle | Line | Image;
