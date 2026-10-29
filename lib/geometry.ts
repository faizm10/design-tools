import { isFloorCovering, isSurfaceItem, hasTopSurface } from "./catalog";
import type { FurnitureItem, Opening, Room, WallSide } from "./types";

export type Vec2 = { x: number; z: number };

const DEG = Math.PI / 180;

/** Corners of an item's footprint in plan coordinates (clockwise rotation). */
export function footprint(item: Pick<FurnitureItem, "x" | "z" | "width" | "depth" | "rotation">): Vec2[] {
  const c = Math.cos(item.rotation * DEG);
  const s = Math.sin(item.rotation * DEG);
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const local: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  // With +z pointing down on screen, a clockwise rotation is the standard
  // rotation matrix applied in (x, z).
  return local.map(([lx, lz]) => ({ x: item.x + lx * c - lz * s, z: item.z + lx * s + lz * c }));
}

/** Half extents of the axis-aligned box that contains a rotated item. */
export function halfExtents(item: Pick<FurnitureItem, "width" | "depth" | "rotation">) {
  const c = Math.abs(Math.cos(item.rotation * DEG));
  const s = Math.abs(Math.sin(item.rotation * DEG));
  return {
    hx: (c * item.width + s * item.depth) / 2,
    hz: (s * item.width + c * item.depth) / 2,
  };
}

export function aabb(item: Pick<FurnitureItem, "x" | "z" | "width" | "depth" | "rotation">) {
  const { hx, hz } = halfExtents(item);
  return { minX: item.x - hx, maxX: item.x + hx, minZ: item.z - hz, maxZ: item.z + hz };
}

function project(poly: Vec2[], ax: Vec2) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax.x + p.z * ax.z;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/** Separating-axis test for two convex polygons. `tolerance` ignores touching edges. */
export function polygonsOverlap(a: Vec2[], b: Vec2[], tolerance = 0.5): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const len = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1;
      const ax = { x: -(p2.z - p1.z) / len, z: (p2.x - p1.x) / len };
      const pa = project(a, ax);
      const pb = project(b, ax);
      if (pa.max - tolerance <= pb.min || pb.max - tolerance <= pa.min) return false;
    }
  }
  return true;
}

export function wallLength(room: Room, wall: WallSide) {
  return wall === "north" || wall === "south" ? room.width : room.length;
}

/**
 * Wall frame: `start` is the corner the offset is measured from, `dir` runs
 * along the wall and `inward` points into the room.
 */
export function wallFrame(room: Room, wall: WallSide) {
  switch (wall) {
    case "north":
      return { start: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, inward: { x: 0, z: 1 } };
    case "south":
      return { start: { x: 0, z: room.length }, dir: { x: 1, z: 0 }, inward: { x: 0, z: -1 } };
    case "west":
      return { start: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, inward: { x: 1, z: 0 } };
    case "east":
      return { start: { x: room.width, z: 0 }, dir: { x: 0, z: 1 }, inward: { x: -1, z: 0 } };
  }
}

export function clampOpeningOffset(room: Room, o: Pick<Opening, "wall" | "width">, offset: number) {
  const len = wallLength(room, o.wall);
  const min = o.width / 2;
  const max = len - o.width / 2;
  if (max < min) return len / 2;
  return Math.min(max, Math.max(min, offset));
}

/** Nearest wall and the offset along it for a plan point (used when dragging openings). */
export function nearestWall(room: Room, p: Vec2): { wall: WallSide; offset: number } {
  const d: [WallSide, number][] = [
    ["north", Math.abs(p.z)],
    ["south", Math.abs(room.length - p.z)],
    ["west", Math.abs(p.x)],
    ["east", Math.abs(room.width - p.x)],
  ];
  d.sort((a, b) => a[1] - b[1]);
  const wall = d[0][0];
  const offset = wall === "north" || wall === "south" ? p.x : p.z;
  return { wall, offset };
}

/** Plan-space quadrilateral swept by a door leaf, used for clearance warnings. */
export function doorSwingArea(room: Room, o: Opening): Vec2[] {
  const f = wallFrame(room, o.wall);
  const a = o.offset - o.width / 2;
  const b = o.offset + o.width / 2;
  const at = (u: number, v: number) => ({
    x: f.start.x + f.dir.x * u + f.inward.x * v,
    z: f.start.z + f.dir.z * u + f.inward.z * v,
  });
  return [at(a, 0), at(b, 0), at(b, o.width), at(a, o.width)];
}

export interface SnapOptions {
  grid: number | null;
  walls: boolean;
  threshold?: number;
}

/**
 * Snap an item's centre position. Grid snapping aligns the item's edges to
 * the grid; wall/object snapping then pulls edges flush against nearby walls
 * and other furniture.
 */
export function snapPosition(
  item: FurnitureItem,
  pos: Vec2,
  room: Room,
  others: FurnitureItem[],
  opts: SnapOptions,
): Vec2 {
  const { hx, hz } = halfExtents(item);
  let { x, z } = pos;
  if (opts.grid) {
    const g = opts.grid;
    x = Math.round((x - hx) / g) * g + hx;
    z = Math.round((z - hz) / g) * g + hz;
  }
  if (opts.walls) {
    const t = opts.threshold ?? 12;
    const xTargets = [0, room.width];
    const zTargets = [0, room.length];
    if (!isFloorCovering(item.type)) {
      for (const o of others) {
        if (o.id === item.id || isFloorCovering(o.type)) continue;
        const b = aabb(o);
        // Only snap to neighbours that are roughly alongside on the other axis.
        if (pos.z + hz > b.minZ - t && pos.z - hz < b.maxZ + t) xTargets.push(b.minX, b.maxX);
        if (pos.x + hx > b.minX - t && pos.x - hx < b.maxX + t) zTargets.push(b.minZ, b.maxZ);
      }
    }
    const best = (center: number, h: number, targets: number[]) => {
      let bestD = t;
      let result = center;
      for (const tg of targets) {
        for (const edge of [center - h, center + h]) {
          const d = Math.abs(edge - tg);
          if (d < bestD) {
            bestD = d;
            result = center + (tg - edge);
          }
        }
      }
      return result;
    };
    x = best(opts.grid ? x : pos.x, hx, xTargets);
    z = best(opts.grid ? z : pos.z, hz, zTargets);
  }
  return { x: round1(x), z: round1(z) };
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

export interface Warning {
  itemId: string;
  kind: "outside" | "overlap" | "door";
  message: string;
}

/** Elevation of surface items (table lamps) that stand on another item. */
export function surfaceElevations(items: FurnitureItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const it of items) {
    if (!isSurfaceItem(it.type)) continue;
    const fp = footprint(it);
    let elev = 0;
    for (const o of items) {
      if (o.id === it.id || !hasTopSurface(o.type)) continue;
      // Only count it as resting on top when the lamp's centre is over the surface.
      const centre = [{ x: it.x - 0.1, z: it.z - 0.1 }, { x: it.x + 0.1, z: it.z - 0.1 }, { x: it.x + 0.1, z: it.z + 0.1 }];
      if (polygonsOverlap(centre, footprint(o), 0) && polygonsOverlap(fp, footprint(o))) {
        elev = Math.max(elev, o.height);
      }
    }
    result.set(it.id, elev);
  }
  return result;
}

export function computeWarnings(room: Room, items: FurnitureItem[], openings: Opening[]): Warning[] {
  const warnings: Warning[] = [];
  const elev = surfaceElevations(items);
  const prints = new Map(items.map((i) => [i.id, footprint(i)]));
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? "Item";

  for (const it of items) {
    const fp = prints.get(it.id)!;
    if (fp.some((p) => p.x < -0.5 || p.z < -0.5 || p.x > room.width + 0.5 || p.z > room.length + 0.5)) {
      warnings.push({ itemId: it.id, kind: "outside", message: `${it.name} extends outside the room` });
    }
    if (it.height + (elev.get(it.id) ?? 0) > room.height + 0.5) {
      warnings.push({ itemId: it.id, kind: "outside", message: `${it.name} is taller than the ceiling` });
    }
  }

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (isFloorCovering(a.type)) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (isFloorCovering(b.type)) continue;
      // A lamp standing on a nightstand is fine.
      if ((elev.get(a.id) ?? 0) > 0 && hasTopSurface(b.type)) continue;
      if ((elev.get(b.id) ?? 0) > 0 && hasTopSurface(a.type)) continue;
      if (polygonsOverlap(prints.get(a.id)!, prints.get(b.id)!)) {
        warnings.push({ itemId: a.id, kind: "overlap", message: `${a.name} overlaps ${nameOf(b.id)}` });
        warnings.push({ itemId: b.id, kind: "overlap", message: `${b.name} overlaps ${nameOf(a.id)}` });
      }
    }
  }

  for (const o of openings) {
    if (o.kind !== "door") continue;
    const swing = doorSwingArea(room, o);
    for (const it of items) {
      if (isFloorCovering(it.type)) continue;
      if (polygonsOverlap(swing, prints.get(it.id)!)) {
        warnings.push({ itemId: it.id, kind: "door", message: `${it.name} blocks the door swing` });
      }
    }
  }
  return warnings;
}

/** Find a free spot for a new item, starting from `preferred`, scanning the room. */
export function findFreeSpot(item: FurnitureItem, room: Room, others: FurnitureItem[], preferred: Vec2): Vec2 {
  const { hx, hz } = halfExtents(item);
  const fits = (p: Vec2) => {
    if (p.x - hx < 0 || p.z - hz < 0 || p.x + hx > room.width || p.z + hz > room.length) return false;
    if (isFloorCovering(item.type)) return true;
    const fp = footprint({ ...item, ...p });
    return !others.some((o) => !isFloorCovering(o.type) && polygonsOverlap(fp, footprint(o)));
  };
  if (fits(preferred)) return preferred;
  const step = 10;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let z = hz; z <= room.length - hz; z += step) {
    for (let x = hx; x <= room.width - hx; x += step) {
      const d = Math.hypot(x - preferred.x, z - preferred.z);
      if (d < bestD && fits({ x, z })) {
        bestD = d;
        best = { x, z };
      }
    }
  }
  return best ?? preferred;
}
