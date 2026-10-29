import { nanoid } from "nanoid";
import { catalogEntry } from "./catalog";
import type { Alcove, FloorMaterial, FurnitureItem, Opening, Room, Scene, Space, WallSide } from "./types";

// Shared by the browser store and the API routes, so it must not touch browser APIs.

export function normalizeAngle(deg: number) {
  const r = ((deg % 360) + 360) % 360;
  return Math.round(r * 10) / 10;
}

/** Lenient validator for imported or persisted scenes. Returns null when the data is unusable. */
export function validateScene(data: unknown): Scene | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const room = d.room as Record<string, unknown> | undefined;
  if (!room || typeof room.width !== "number" || typeof room.length !== "number" || typeof room.height !== "number") return null;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const r: Room = {
    name: str(room.name, "Bedroom"),
    width: clamp(num(room.width, 360), 100, 2000),
    length: clamp(num(room.length, 420), 100, 2000),
    height: clamp(num(room.height, 250), 180, 600),
    wallColor: str(room.wallColor, "#ece8e1"),
    floor: floorOr(room.floor, "oak"),
    alcoves: [],
    spaces: [],
  };
  const walls = ["north", "east", "south", "west"];
  r.alcoves = (Array.isArray(room.alcoves) ? room.alcoves : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && walls.includes((a as Alcove).wall))
    .slice(0, 8)
    .map((a) => {
      const w = a.window as Record<string, unknown> | null | undefined;
      return {
        id: str(a.id, nanoid(8)),
        wall: a.wall as WallSide,
        offset: clamp(num(a.offset, 0), 0, 2000),
        width: clamp(num(a.width, 150), 30, 2000),
        depth: clamp(num(a.depth, 60), 10, 400),
        window: w && typeof w === "object" ? { width: clamp(num(w.width, 80), 20, 2000), height: clamp(num(w.height, 120), 20, 600), sill: clamp(num(w.sill, 90), 0, 600) } : null,
      };
    });
  r.spaces = (Array.isArray(room.spaces) ? room.spaces : [])
    .filter((sp): sp is Record<string, unknown> => !!sp && typeof sp === "object")
    .slice(0, 12)
    .map((sp): Space => {
      const kind = (["bathroom", "closet", "room"].includes(sp.kind as string) ? sp.kind : "room") as Space["kind"];
      const door = sp.door as Record<string, unknown> | null | undefined;
      return {
        id: str(sp.id, nanoid(8)),
        name: str(sp.name, "Room"),
        kind,
        x: clamp(num(sp.x, 0), -2000, 4000),
        z: clamp(num(sp.z, 0), -2000, 4000),
        width: clamp(num(sp.width, 150), 60, 2000),
        length: clamp(num(sp.length, 150), 60, 2000),
        floor: floorOr(sp.floor, kind === "bathroom" ? "tile" : r.floor),
        door:
          door && typeof door === "object" && walls.includes(door.wall as string)
            ? {
                wall: door.wall as WallSide,
                offset: num(door.offset, 50),
                width: clamp(num(door.width, 70), 30, 2000),
                hinge: door.hinge === "end" ? "end" : "start",
                swing: door.swing === "out" ? "out" : "in",
              }
            : null,
      };
    });
  const openings: Opening[] = (Array.isArray(d.openings) ? d.openings : [])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && walls.includes((o as Opening).wall))
    .map((o) => ({
      id: str(o.id, nanoid(8)),
      kind: o.kind === "window" ? "window" : "door",
      wall: o.wall as WallSide,
      offset: num(o.offset, 100),
      width: num(o.width, 80),
      height: num(o.height, 200),
      sill: num(o.sill, 0),
      hinge: o.hinge === "end" ? "end" : "start",
      swing: o.swing === "out" ? "out" : "in",
    }));
  const furniture: FurnitureItem[] = (Array.isArray(d.furniture) ? d.furniture : [])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && !!catalogEntry(str((f as FurnitureItem).catalogId, "")))
    .map((f) => {
      const c = catalogEntry(f.catalogId as string)!;
      return {
        id: str(f.id, nanoid(8)),
        type: c.type,
        catalogId: c.id,
        name: str(f.name, c.name),
        x: num(f.x, r.width / 2),
        z: num(f.z, r.length / 2),
        rotation: normalizeAngle(num(f.rotation, 0)),
        width: clamp(num(f.width, c.width), 5, 1000),
        depth: clamp(num(f.depth, c.depth), 5, 1000),
        height: clamp(num(f.height, c.height), 1, 600),
        elevation: clamp(num(f.elevation, c.elevation ?? 0), 0, 600),
        color: str(f.color, c.color),
      };
    });
  return { version: 1, room: r, openings, furniture };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const FLOORS: FloorMaterial[] = ["oak", "walnut", "ash", "tile", "carpet", "concrete"];
const floorOr = (v: unknown, fallback: FloorMaterial): FloorMaterial => (FLOORS.includes(v as FloorMaterial) ? (v as FloorMaterial) : fallback);
