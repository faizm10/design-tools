import type { Room, Scene } from "../types";

/**
 * Structural equality that ignores key order and `undefined` properties.
 * Scenes round-trip through Postgres jsonb, which reorders keys and drops
 * undefined, so JSON.stringify comparisons would report false changes.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

/**
 * Three-way merge of lists of things with ids. For each id, whichever side
 * changed it relative to `base` wins, and local wins if both did. Adding,
 * editing and deleting all count as changes. Order follows `remote`, with
 * local additions appended.
 */
function mergeList<T extends { id: string }>(base: readonly T[], local: readonly T[], remote: readonly T[]): T[] {
  const B = new Map(base.map((x) => [x.id, x]));
  const L = new Map(local.map((x) => [x.id, x]));
  const R = new Map(remote.map((x) => [x.id, x]));
  const pick = (id: string) => (deepEqual(B.get(id), L.get(id)) ? R.get(id) : L.get(id));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of [...R.keys(), ...L.keys()]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const v = pick(id);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Merge a remote scene into the local one, given the scene both started
 * from. Two people editing different pieces of furniture, doors or rooms
 * both keep their changes; only edits to the very same thing conflict, and
 * then the local edit wins (it is about to be sent, and will win remotely too).
 */
export function mergeScenes(base: Scene, local: Scene, remote: Scene): Scene {
  if (deepEqual(base, local)) return remote;
  if (deepEqual(base, remote)) return local;
  const room = {} as Room;
  const keys = new Set([...Object.keys(remote.room), ...Object.keys(local.room)]) as Set<keyof Room>;
  for (const k of keys) {
    if (k === "alcoves" || k === "spaces") continue;
    (room as unknown as Record<string, unknown>)[k] = deepEqual(base.room[k], local.room[k]) ? remote.room[k] : local.room[k];
  }
  room.alcoves = mergeList(base.room.alcoves, local.room.alcoves, remote.room.alcoves);
  room.spaces = mergeList(base.room.spaces, local.room.spaces, remote.room.spaces);
  return {
    version: 1,
    room,
    openings: mergeList(base.openings, local.openings, remote.openings),
    furniture: mergeList(base.furniture, local.furniture, remote.furniture),
  };
}
