// Scene model. All lengths are centimetres, all angles degrees.
//
// Plan coordinates: origin at the north-west inner corner of the room,
// +x runs east (along the room width), +z runs south (along the room length).
// Rotation is clockwise when viewed from above. A furniture item's local
// "front" faces +z at rotation 0, so its back sits against the north wall.

export type Unit = "cm" | "imperial";

export type WallSide = "north" | "east" | "south" | "west";

export type FloorMaterial = "oak" | "walnut" | "ash" | "tile" | "carpet" | "concrete";

export type FurnitureType =
  | "bed"
  | "wardrobe"
  | "desk"
  | "chair"
  | "armchair"
  | "nightstand"
  | "dresser"
  | "bookcase"
  | "rug"
  | "rug-round"
  | "floor-lamp"
  | "table-lamp"
  | "plant"
  | "tv"
  | "tv-stand"
  | "sofa"
  | "bench"
  | "pouf"
  | "side-table"
  | "floor-mirror"
  | "wall-mirror"
  | "wall-shelf"
  | "wall-panel"
  | "wall-art"
  | "clock"
  | "curtain"
  | "led-strip"
  | "neon-sign"
  | "pendant"
  | "corner-led"
  | "vase"
  | "books"
  | "basket";

/** A recess that extends the room outward through one wall, e.g. a desk nook or bay. */
export interface Alcove {
  id: string;
  wall: WallSide;
  /** Distance from the wall's start corner to the alcove's near edge. */
  offset: number;
  width: number;
  depth: number;
  /** Optional window centred in the alcove's back wall. */
  window: { width: number; height: number; sill: number } | null;
}

export interface Room {
  name: string;
  width: number; // x extent
  length: number; // z extent
  height: number; // ceiling height
  wallColor: string;
  floor: FloorMaterial;
  alcoves: Alcove[];
}

export interface Opening {
  id: string;
  kind: "door" | "window";
  wall: WallSide;
  /** Distance from the wall's start corner to the opening's centre. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: number;
  /** Doors only: which end of the opening the hinge sits at. */
  hinge: "start" | "end";
}

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  /** Catalogue entry this item was created from. */
  catalogId: string;
  name: string;
  x: number; // centre
  z: number; // centre
  rotation: number;
  width: number;
  depth: number;
  height: number;
  /** Height of the item's base above the floor; wall and ceiling pieces sit above 0. */
  elevation?: number;
  color: string;
}

export interface Scene {
  version: 1;
  room: Room;
  openings: Opening[];
  furniture: FurnitureItem[];
}

export type Selection =
  | { kind: "furniture"; id: string }
  | { kind: "opening"; id: string }
  | null;

export type ViewMode = "2d" | "3d";

export type WallVisibility = "auto" | "all" | "cutaway";
