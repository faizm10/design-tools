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
