import { catalogEntry } from "./catalog";
import type { FurnitureItem, Scene } from "./types";

let n = 0;
function item(catalogId: string, x: number, z: number, rotation = 0, patch: Partial<FurnitureItem> = {}): FurnitureItem {
  const c = catalogEntry(catalogId)!;
  n += 1;
  return {
    id: `ex-${n}`,
    type: c.type,
    catalogId,
    name: c.name,
    x,
    z,
    rotation,
    width: c.width,
    depth: c.depth,
    height: c.height,
    color: c.color,
    ...patch,
  };
}

/** A furnished 3.6 × 4.2 m bedroom that loads on first visit. */
export function exampleScene(): Scene {
  n = 0;
  return {
    version: 1,
    room: { name: "Main bedroom", width: 360, length: 420, height: 250, wallColor: "#ece8e1", floor: "oak" },
    openings: [
      { id: "ex-door", kind: "door", wall: "south", offset: 300, width: 80, height: 205, sill: 0, hinge: "end" },
      { id: "ex-window", kind: "window", wall: "east", offset: 250, width: 120, height: 120, sill: 90, hinge: "start" },
      { id: "ex-window-2", kind: "window", wall: "north", offset: 180, width: 100, height: 60, sill: 150, hinge: "start" },
    ],
    furniture: [
      item("rug-rect", 180, 195, 0, { color: "#c9bfae" }),
      item("bed-double", 180, 105, 0),
      item("nightstand", 72.5, 19),
      item("nightstand", 287.5, 19),
      item("table-lamp", 72.5, 19),
      item("table-lamp", 287.5, 19),
      item("wardrobe-3", 30, 330, 270),
      item("desk", 330, 250, 90),
      item("chair", 266, 250, 270),
      item("plant", 335, 30),
      item("floor-lamp", 26, 222),
    ],
  };
}

/**
 * Long 7.5 × 3.7 m bedroom traced from a hand sketch: bathroom and closet
 * doors on the north wall, the entrance on the east wall, and three
 * windows along the south wall (the middle one sits in a 174 × 63 cm
 * alcove, which the rectangular room model doesn't capture).
 */
export function sketchBedroomScene(): Scene {
  n = 0;
  return {
    version: 1,
    room: { name: "My bedroom", width: 750, length: 370, height: 250, wallColor: "#ece8e1", floor: "oak" },
    openings: [
      { id: "sk-bathroom", kind: "door", wall: "north", offset: 60, width: 70, height: 205, sill: 0, hinge: "start" },
      { id: "sk-closet", kind: "door", wall: "north", offset: 652, width: 115, height: 205, sill: 0, hinge: "start" },
      { id: "sk-entrance", kind: "door", wall: "east", offset: 55, width: 80, height: 205, sill: 0, hinge: "start" },
      { id: "sk-window-w", kind: "window", wall: "south", offset: 55, width: 70, height: 120, sill: 90, hinge: "start" },
      { id: "sk-window-alcove", kind: "window", wall: "south", offset: 386, width: 73, height: 120, sill: 90, hinge: "start" },
      { id: "sk-window-e", kind: "window", wall: "south", offset: 672, width: 70, height: 120, sill: 90, hinge: "start" },
    ],
    furniture: [
      item("bed-double", 80, 245, 0, { width: 135, depth: 200 }),
      item("dresser-3", 720, 295, 90, { width: 100, depth: 50 }),
    ],
  };
}

/** Empty 3.5 × 4 m room with one door, for starting from scratch. */
export function emptyScene(): Scene {
  return {
    version: 1,
    room: { name: "New bedroom", width: 350, length: 400, height: 250, wallColor: "#f6f4ef", floor: "ash" },
    openings: [{ id: "em-door", kind: "door", wall: "south", offset: 290, width: 80, height: 205, sill: 0, hinge: "end" }],
    furniture: [],
  };
}

export interface Template {
  id: string;
  name: string;
  description: string;
  build: () => Scene;
}

export const TEMPLATES: Template[] = [
  { id: "example", name: "Furnished bedroom", description: "3.6 × 4.2 m, double bed, wardrobe and desk", build: exampleScene },
  { id: "sketch", name: "My bedroom", description: "7.5 × 3.7 m, bathroom, closet, three windows", build: sketchBedroomScene },
  { id: "empty", name: "Empty room", description: "3.5 × 4 m with a single door", build: emptyScene },
];
