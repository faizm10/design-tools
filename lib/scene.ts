import { nanoid } from "nanoid";
import { catalogEntry } from "./catalog";
import type { FurnitureItem, Opening, Room, Scene, WallSide } from "./types";

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
    floor: (["oak", "walnut", "ash", "tile", "carpet", "concrete"].includes(room.floor as string) ? room.floor : "oak") as Room["floor"],
  };
  const walls = ["north", "east", "south", "west"];
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
        color: str(f.color, c.color),
      };
    });
  return { version: 1, room: r, openings, furniture };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
