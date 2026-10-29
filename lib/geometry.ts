import { isFloorCovering, isSurfaceItem, hasTopSurface } from "./catalog";
import type { Alcove, DoorSwing, FurnitureItem, Opening, Room, Scene, Space, WallSide } from "./types";

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

/** Anything with a rectangular floor: the main room (at the origin) or a space. */
type Box = { x?: number; z?: number; width: number; length: number };

export function wallLength(room: Box, wall: WallSide) {
  return wall === "north" || wall === "south" ? room.width : room.length;
}

export interface WallFrame {
  start: Vec2;
  dir: Vec2;
  inward: Vec2;
}

/**
 * Wall frame: `start` is the corner the offset is measured from, `dir` runs
 * along the wall and `inward` points into the room. Works for the main room
 * and for spaces, whose north-west corner is at (x, z).
 */
export function wallFrame(room: Box, wall: WallSide): WallFrame {
  const x = room.x ?? 0;
  const z = room.z ?? 0;
  switch (wall) {
    case "north":
      return { start: { x, z }, dir: { x: 1, z: 0 }, inward: { x: 0, z: 1 } };
    case "south":
      return { start: { x, z: z + room.length }, dir: { x: 1, z: 0 }, inward: { x: 0, z: -1 } };
    case "west":
      return { start: { x, z }, dir: { x: 0, z: 1 }, inward: { x: 1, z: 0 } };
    case "east":
      return { start: { x: x + room.width, z }, dir: { x: 0, z: 1 }, inward: { x: -1, z: 0 } };
  }
}

export function clampOpeningOffset(room: Room, o: Pick<Opening, "wall" | "width">, offset: number) {
  const len = wallLength(room, o.wall);
  const min = o.width / 2;
  const max = len - o.width / 2;
  if (max < min) return len / 2;
  return Math.min(max, Math.max(min, offset));
}

export const MIN_ROOM = 150;
export const MAX_ROOM = 2000;

/** Swap in a new room, pulling alcoves and openings back onto their walls if it shrank. */
export function withRoom(scene: Scene, next: Room): Scene {
  const room = { ...next, alcoves: next.alcoves.map((a) => clampAlcove(next, a)) };
  const openings = scene.openings.map((o) => {
    const width = Math.min(o.width, wallLength(room, o.wall));
    const height = Math.min(o.height, room.height - o.sill);
    return { ...o, width, height, offset: clampOpeningOffset(room, { ...o, width }, o.offset) };
  });
  return { ...scene, room, openings };
}

/** Plan coordinate of a wall's inner face: x for west/east, z for north/south. */
export function wallPosition(room: Room, wall: WallSide) {
  return wall === "east" ? room.width : wall === "south" ? room.length : 0;
}

/**
 * Move one of the room's walls so its inner face sits at plan coordinate `pos`
 * (x for west/east, z for north/south). The plan origin is the north-west
 * corner, so moving the west or north wall re-bases the plan: furniture,
 * openings and alcoves are shifted so they stay put relative to the other walls.
 * Returns the new scene and how far the origin moved.
 */
export function moveWall(scene: Scene, wall: WallSide, pos: number): { scene: Scene; shift: Vec2 } {
  const { room } = scene;
  const clampSize = (v: number) => round1(Math.min(MAX_ROOM, Math.max(MIN_ROOM, v)));
  if (wall === "east") return { scene: withRoom(scene, { ...room, width: clampSize(pos) }), shift: { x: 0, z: 0 } };
  if (wall === "south") return { scene: withRoom(scene, { ...room, length: clampSize(pos) }), shift: { x: 0, z: 0 } };

  const horizontal = wall === "west"; // the west wall moves along x
  const size = clampSize((horizontal ? room.width : room.length) - pos);
  const d = round1((horizontal ? room.width : room.length) - size);
  if (d === 0) return { scene, shift: { x: 0, z: 0 } };
  // Openings and alcoves on the walls running across the moved one are measured from it.
  const across = (w: WallSide) => (horizontal ? w === "north" || w === "south" : w === "west" || w === "east");
  const shifted: Scene = {
    ...scene,
    furniture: scene.furniture.map((f) => (horizontal ? { ...f, x: round1(f.x - d) } : { ...f, z: round1(f.z - d) })),
    openings: scene.openings.map((o) => (across(o.wall) ? { ...o, offset: round1(o.offset - d) } : o)),
  };
  const next: Room = {
    ...room,
    ...(horizontal ? { width: size } : { length: size }),
    alcoves: room.alcoves.map((a) => (across(a.wall) ? { ...a, offset: round1(a.offset - d) } : a)),
    spaces: room.spaces.map((sp) => (horizontal ? { ...sp, x: round1(sp.x - d) } : { ...sp, z: round1(sp.z - d) })),
  };
  return { scene: withRoom(shifted, next), shift: horizontal ? { x: d, z: 0 } : { x: 0, z: d } };
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Plan-space rectangle covered by an alcove's floor. */
export function alcoveRect(room: Room, a: Alcove): Rect {
  switch (a.wall) {
    case "north":
      return { minX: a.offset, maxX: a.offset + a.width, minZ: -a.depth, maxZ: 0 };
    case "south":
      return { minX: a.offset, maxX: a.offset + a.width, minZ: room.length, maxZ: room.length + a.depth };
    case "west":
      return { minX: -a.depth, maxX: 0, minZ: a.offset, maxZ: a.offset + a.width };
    case "east":
      return { minX: room.width, maxX: room.width + a.depth, minZ: a.offset, maxZ: a.offset + a.width };
  }
}

export function clampAlcove(room: Room, a: Alcove): Alcove {
  const len = wallLength(room, a.wall);
  const width = Math.max(30, Math.min(a.width, len));
  const offset = Math.max(0, Math.min(a.offset, len - width));
  const depth = Math.max(10, Math.min(a.depth, 400));
  const window = a.window
    ? {
        width: Math.max(20, Math.min(a.window.width, width)),
        sill: Math.max(0, Math.min(a.window.sill, room.height - 20)),
        height: Math.max(20, Math.min(a.window.height, room.height - Math.max(0, a.window.sill))),
      }
    : null;
  return { ...a, width, offset, depth, window };
}

const inRect = (p: Vec2, r: Rect, tol: number) => p.x >= r.minX - tol && p.x <= r.maxX + tol && p.z >= r.minZ - tol && p.z <= r.maxZ + tol;

export function spaceRect(sp: Space): Rect {
  return { minX: sp.x, maxX: sp.x + sp.width, minZ: sp.z, maxZ: sp.z + sp.length };
}

/** Whether a plan point lies on the room's floor, including alcoves and spaces built onto it. */
export function insideRoom(room: Room, p: Vec2, tol = 0.5): boolean {
  if (inRect(p, { minX: 0, maxX: room.width, minZ: 0, maxZ: room.length }, tol)) return true;
  if (room.spaces.some((sp) => inRect(p, spaceRect(sp), tol))) return true;
  return room.alcoves.some((a) => inRect(p, alcoveRect(room, a), tol));
}

export const MIN_SPACE = 60;

export function clampSpace(room: Room, sp: Space): Space {
  const width = Math.max(MIN_SPACE, Math.min(sp.width, MAX_ROOM));
  const length = Math.max(MIN_SPACE, Math.min(sp.length, MAX_ROOM));
  // Keep the space touching or overlapping the main room so it can't get lost off-screen.
  const x = Math.max(-width - 400, Math.min(sp.x, room.width + 400));
  const z = Math.max(-length - 400, Math.min(sp.z, room.length + 400));
  const next = { ...sp, width, length, x, z };
  if (next.door) {
    const len = wallLength(next, next.door.wall);
    const w = Math.max(30, Math.min(next.door.width, len));
    next.door = { ...next.door, width: w, offset: Math.min(len - w / 2, Math.max(w / 2, next.door.offset)) };
  }
  return next;
}

/** Corners plus points along each edge, so items straddling an alcove's mouth are checked properly. */
function edgeSamples(poly: Vec2[], perEdge = 4): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let k = 0; k < perEdge; k++) out.push({ x: a.x + ((b.x - a.x) * k) / perEdge, z: a.z + ((b.z - a.z) * k) / perEdge });
  }
  return out;
}

/** Nearest wall and the offset along it for a plan point (used when dragging openings). */
export function nearestWall(room: Box, p: Vec2): { wall: WallSide; offset: number } {
  const x0 = room.x ?? 0;
  const z0 = room.z ?? 0;
  const d: [WallSide, number][] = [
    ["north", Math.abs(p.z - z0)],
    ["south", Math.abs(z0 + room.length - p.z)],
    ["west", Math.abs(p.x - x0)],
    ["east", Math.abs(x0 + room.width - p.x)],
  ];
  d.sort((a, b) => a[1] - b[1]);
  const wall = d[0][0];
  const offset = wall === "north" || wall === "south" ? p.x - x0 : p.z - z0;
  return { wall, offset };
}

/**
 * Plan-space quadrilateral swept by a door leaf, used for clearance warnings.
 * A door that swings out sweeps the far side of its wall (`thickness` thick).
 */
export function doorSwingArea(f: WallFrame, o: { offset: number; width: number; swing?: DoorSwing }, thickness = 12): Vec2[] {
  const a = o.offset - o.width / 2;
  const b = o.offset + o.width / 2;
  const v0 = o.swing === "out" ? -thickness : 0;
  const v1 = o.swing === "out" ? -thickness - o.width : o.width;
  const at = (u: number, v: number) => ({
    x: f.start.x + f.dir.x * u + f.inward.x * v,
    z: f.start.z + f.dir.z * u + f.inward.z * v,
  });
  return [at(a, v0), at(b, v0), at(b, v1), at(a, v1)];
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
    // Space walls count too, inside and out (partitions are 12 cm thick like the main walls).
    for (const sp of room.spaces) {
      const r = spaceRect(sp);
      if (pos.z + hz > r.minZ - t && pos.z - hz < r.maxZ + t) xTargets.push(r.minX, r.maxX, r.minX - 12, r.maxX + 12);
      if (pos.x + hx > r.minX - t && pos.x - hx < r.maxX + t) zTargets.push(r.minZ, r.maxZ, r.minZ - 12, r.maxZ + 12);
    }
    // Alcove walls count as walls when the item is near the alcove.
    for (const a of room.alcoves) {
      const r = alcoveRect(room, a);
      if (pos.z + hz > r.minZ - t && pos.z - hz < r.maxZ + t) xTargets.push(r.minX, r.maxX);
      if (pos.x + hx > r.minX - t && pos.x - hx < r.maxX + t) zTargets.push(r.minZ, r.maxZ);
    }
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

/**
 * Base height of every item: its own elevation, or for surface items left on
 * the floor (lamps, TVs, vases), the top of whatever they stand on.
 */
export function surfaceElevations(items: FurnitureItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const it of items) {
    const own = it.elevation ?? 0;
    if (!isSurfaceItem(it.type) || own > 0) {
      result.set(it.id, own);
      continue;
    }
    const fp = footprint(it);
    let elev = 0;
    for (const o of items) {
      if (o.id === it.id || !hasTopSurface(o.type)) continue;
      // Only count it as resting on top when the lamp's centre is over the surface.
      const centre = [{ x: it.x - 0.1, z: it.z - 0.1 }, { x: it.x + 0.1, z: it.z - 0.1 }, { x: it.x + 0.1, z: it.z + 0.1 }];
      if (polygonsOverlap(centre, footprint(o), 0) && polygonsOverlap(fp, footprint(o))) {
        elev = Math.max(elev, (o.elevation ?? 0) + o.height);
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
    if (edgeSamples(fp).some((p) => !insideRoom(room, p))) {
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
      // Items at different heights (a shelf above a desk) don't collide.
      const a0 = elev.get(a.id) ?? 0;
      const b0 = elev.get(b.id) ?? 0;
      if (a0 + a.height <= b0 + 0.5 || b0 + b.height <= a0 + 0.5) continue;
      if (polygonsOverlap(prints.get(a.id)!, prints.get(b.id)!)) {
        warnings.push({ itemId: a.id, kind: "overlap", message: `${a.name} overlaps ${nameOf(b.id)}` });
        warnings.push({ itemId: b.id, kind: "overlap", message: `${b.name} overlaps ${nameOf(a.id)}` });
      }
    }
  }

  // Main-room doors swinging out sweep outside the room, where there is no furniture.
  const swings = [
    ...openings.filter((o) => o.kind === "door" && o.swing !== "out").map((o) => ({ area: doorSwingArea(wallFrame(room, o.wall), o), height: o.height })),
    ...room.spaces.flatMap((sp) => (sp.door ? [{ area: doorSwingArea(wallFrame(sp, sp.door.wall), sp.door), height: 205 }] : [])),
  ];
  for (const o of swings) {
    const swing = o.area;
    for (const it of items) {
      if (isFloorCovering(it.type) || (elev.get(it.id) ?? 0) >= o.height) continue;
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

const WALL_ROTATION: Record<WallSide, number> = { north: 0, east: 90, south: 180, west: 270 };

/**
 * Place a wall-mounted item flat against a wall, facing into the room,
 * clear of doors and windows and of other items at the same height.
 * Curtains are centred over the first window instead, sized to cover it.
 */
export function findWallSpot(
  item: FurnitureItem,
  room: Room,
  others: FurnitureItem[],
  openings: Opening[],
): Partial<FurnitureItem> | null {
  const base = item.elevation ?? 0;
  const top = base + item.height;
  const at = (wall: WallSide, u: number, width = item.width): Partial<FurnitureItem> => {
    const f = wallFrame(room, wall);
    const v = item.depth / 2;
    return {
      x: round1(f.start.x + f.dir.x * u + f.inward.x * v),
      z: round1(f.start.z + f.dir.z * u + f.inward.z * v),
      rotation: WALL_ROTATION[wall],
      width,
    };
  };

  if (item.type === "curtain") {
    const win = openings.find((o) => o.kind === "window");
    if (win) return at(win.wall, win.offset, Math.min(wallLength(room, win.wall), Math.max(item.width, win.width + 40)));
  }

  const elev = surfaceElevations(others);
  for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
    const len = wallLength(room, wall);
    if (len < item.width) continue;
    const blocked = (u: number) => {
      const a = u - item.width / 2;
      const b = u + item.width / 2;
      // Openings in the same height band get in the way (a print can hang above a door, not across it).
      const hitsOpening = openings.some(
        (o) => o.wall === wall && a < o.offset + o.width / 2 && b > o.offset - o.width / 2 && base < o.sill + o.height && top > o.sill,
      );
      if (hitsOpening) return true;
      const probe = { ...item, ...at(wall, u) } as FurnitureItem;
      const fp = footprint(probe);
      return others.some((o) => {
        if (isFloorCovering(o.type)) return false;
        const o0 = elev.get(o.id) ?? 0;
        if (o0 >= top || o0 + o.height <= base) return false;
        return polygonsOverlap(fp, footprint(o));
      });
    };
    // Search outward from the middle of the wall.
    for (let step = 0; step <= len / 2; step += 10) {
      for (const u of [len / 2 - step, len / 2 + step]) {
        if (u - item.width / 2 < 0 || u + item.width / 2 > len) continue;
        if (!blocked(u)) return at(wall, u);
      }
    }
  }
  return null;
}
