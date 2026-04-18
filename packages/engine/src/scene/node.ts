import type { Box } from "./box.ts";
import type { Group } from "./group.ts";
import type { Layer } from "./layer.ts";
import type { Rect } from "./rect.ts";

export type Node = Group | Layer | Rect | Box;
