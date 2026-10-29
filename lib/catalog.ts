import type { FurnitureType } from "./types";

export type CatalogCategory = "Beds" | "Storage" | "Desks & seating" | "Media" | "Textiles" | "Lighting" | "Decor";

export interface CatalogEntry {
  id: string;
  type: FurnitureType;
  name: string;
  category: CatalogCategory;
  width: number;
  depth: number;
  height: number;
  color: string;
  /** Suggested finishes shown as swatches in the properties panel. */
  colors: string[];
  keywords: string[];
}

const WOODS = ["#d8c3a0", "#b98d5f", "#7a5232", "#4a3426", "#f2efe9", "#2b2b2b"];
const FABRICS = ["#d9d4cb", "#9aa3a0", "#5d6b73", "#2f3d4c", "#b9826a", "#e8e2d6", "#6b705c"];

export const CATALOG: CatalogEntry[] = [
  { id: "bed-double", type: "bed", name: "Double bed", category: "Beds", width: 160, depth: 210, height: 95, color: "#d9d4cb", colors: FABRICS, keywords: ["queen", "bed", "sleep"] },
  { id: "bed-king", type: "bed", name: "King bed", category: "Beds", width: 190, depth: 215, height: 100, color: "#5d6b73", colors: FABRICS, keywords: ["king", "bed", "large"] },
  { id: "bed-single", type: "bed", name: "Single bed", category: "Beds", width: 100, depth: 205, height: 90, color: "#b98d5f", colors: [...WOODS, ...FABRICS.slice(0, 3)], keywords: ["twin", "single", "kids", "bed"] },
  { id: "nightstand", type: "nightstand", name: "Nightstand", category: "Storage", width: 45, depth: 38, height: 55, color: "#d8c3a0", colors: WOODS, keywords: ["bedside", "table", "drawer"] },
  { id: "wardrobe-2", type: "wardrobe", name: "Wardrobe, 2 doors", category: "Storage", width: 100, depth: 60, height: 201, color: "#f2efe9", colors: WOODS, keywords: ["closet", "armoire", "cabinet"] },
  { id: "wardrobe-3", type: "wardrobe", name: "Wardrobe, 3 doors", category: "Storage", width: 150, depth: 60, height: 236, color: "#d8c3a0", colors: WOODS, keywords: ["closet", "armoire", "tall"] },
  { id: "dresser-6", type: "dresser", name: "Dresser, 6 drawers", category: "Storage", width: 140, depth: 48, height: 78, color: "#b98d5f", colors: WOODS, keywords: ["chest", "drawers", "commode"] },
  { id: "dresser-3", type: "dresser", name: "Chest of 3 drawers", category: "Storage", width: 80, depth: 45, height: 82, color: "#f2efe9", colors: WOODS, keywords: ["chest", "drawers"] },
  { id: "bookcase", type: "bookcase", name: "Bookcase", category: "Storage", width: 80, depth: 30, height: 180, color: "#f2efe9", colors: WOODS, keywords: ["shelf", "shelving", "books"] },
  { id: "desk", type: "desk", name: "Desk", category: "Desks & seating", width: 120, depth: 60, height: 74, color: "#d8c3a0", colors: WOODS, keywords: ["table", "work", "study", "office"] },
  { id: "desk-small", type: "desk", name: "Compact desk", category: "Desks & seating", width: 90, depth: 50, height: 74, color: "#f2efe9", colors: WOODS, keywords: ["table", "small", "laptop"] },
  { id: "chair", type: "chair", name: "Desk chair", category: "Desks & seating", width: 46, depth: 50, height: 82, color: "#b98d5f", colors: [...WOODS, ...FABRICS.slice(2, 5)], keywords: ["seat", "dining", "chair"] },
  { id: "armchair", type: "armchair", name: "Armchair", category: "Desks & seating", width: 78, depth: 82, height: 88, color: "#9aa3a0", colors: FABRICS, keywords: ["lounge", "sofa", "reading", "seat"] },
  { id: "tv-55", type: "tv", name: "TV, 55″", category: "Media", width: 123, depth: 24, height: 76, color: "#1d1f22", colors: ["#1d1f22", "#3a3d42", "#c9cbce"], keywords: ["television", "screen", "monitor", "tv"] },
  { id: "tv-65", type: "tv", name: "TV, 65″", category: "Media", width: 145, depth: 28, height: 89, color: "#1d1f22", colors: ["#1d1f22", "#3a3d42", "#c9cbce"], keywords: ["television", "screen", "large", "tv"] },
  { id: "tv-stand", type: "tv-stand", name: "TV stand", category: "Media", width: 160, depth: 40, height: 50, color: "#b98d5f", colors: WOODS, keywords: ["media", "console", "unit", "bench", "tv"] },
  { id: "rug-rect", type: "rug", name: "Rug, rectangular", category: "Textiles", width: 200, depth: 140, height: 1, color: "#c9bfae", colors: ["#c9bfae", "#e8e2d6", "#8a8f86", "#4b5563", "#b9826a", "#2f3d4c"], keywords: ["carpet", "mat"] },
  { id: "rug-round", type: "rug-round", name: "Rug, round", category: "Textiles", width: 140, depth: 140, height: 1, color: "#8a8f86", colors: ["#c9bfae", "#e8e2d6", "#8a8f86", "#4b5563", "#b9826a", "#2f3d4c"], keywords: ["carpet", "circle", "mat"] },
  { id: "floor-lamp", type: "floor-lamp", name: "Floor lamp", category: "Lighting", width: 38, depth: 38, height: 155, color: "#f1ece2", colors: ["#f1ece2", "#e9d7b7", "#2b2b2b", "#9aa3a0"], keywords: ["light", "standing", "uplight"] },
  { id: "table-lamp", type: "table-lamp", name: "Table lamp", category: "Lighting", width: 26, depth: 26, height: 42, color: "#f1ece2", colors: ["#f1ece2", "#e9d7b7", "#2b2b2b", "#9aa3a0"], keywords: ["light", "bedside", "desk lamp"] },
  { id: "plant", type: "plant", name: "Potted plant", category: "Decor", width: 45, depth: 45, height: 110, color: "#e9e4da", colors: ["#e9e4da", "#b9826a", "#2b2b2b", "#5d6b73"], keywords: ["green", "pot", "ficus"] },
];

export const CATEGORIES: CatalogCategory[] = ["Beds", "Storage", "Desks & seating", "Media", "Textiles", "Lighting", "Decor"];

export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}

/** Items that sit on the floor beneath everything else and never count as overlapping. */
export const isFloorCovering = (t: FurnitureType) => t === "rug" || t === "rug-round";

/** Items that rest on top of another item's surface when placed over it. */
export const isSurfaceItem = (t: FurnitureType) => t === "table-lamp" || t === "tv";

/** Items with a usable top that a surface item may stand on. */
export const hasTopSurface = (t: FurnitureType) =>
  t === "nightstand" || t === "desk" || t === "dresser" || t === "bookcase" || t === "tv-stand";
