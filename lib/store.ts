import { create } from "zustand";
import { nanoid } from "nanoid";
import { catalogEntry } from "./catalog";
import { exampleScene, TEMPLATES } from "./templates";
import { normalizeAngle, validateScene } from "./scene";

export { normalizeAngle, validateScene };
import { clampAlcove, clampOpeningOffset, clampSpace, footprint, polygonsOverlap, spaceRect, findWallSpot, findFreeSpot, moveWall as moveWallTo, round1, wallLength, withRoom, type Vec2 } from "./geometry";
import type {
  Alcove,
  DoorSwing,
  Space,
  SpaceKind,
  FurnitureItem,
  Opening,
  Room,
  Scene,
  Selection,
  Unit,
  ViewMode,
  WallSide,
  WallVisibility,
} from "./types";

export const STORAGE_KEY = "bedroom-planner:v1";
const HISTORY_LIMIT = 150;
const COALESCE_MS = 900;

interface Prefs {
  view: ViewMode;
  unit: Unit;
  gridSnap: boolean;
  gridSize: number;
  wallSnap: boolean;
  wallVisibility: WallVisibility;
  showDimensions: boolean;
}

export interface PlannerState extends Prefs {
  scene: Scene;
  past: Scene[];
  future: Scene[];
  selection: Selection;
  /** True while an item or opening is being dragged; views use it to freeze camera input. */
  dragging: boolean;
  savedAt: number | null;

  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  select: (s: Selection) => void;
  setDragging: (d: boolean) => void;

  /** Apply an undoable change. Changes sharing a `coalesceKey` in quick succession merge into one step. */
  commit: (fn: (s: Scene) => Scene, coalesceKey?: string) => void;
  /** Start a drag gesture; the first `gestureUpdate` records a single history step. */
  beginGesture: () => void;
  gestureUpdate: (fn: (s: Scene) => Scene) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;

  updateRoom: (patch: Partial<Room>, coalesceKey?: string) => void;
  addFurniture: (catalogId: string, at?: Vec2) => string | null;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>, coalesceKey?: string) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  rotateSelected: (deg: number) => void;
  addOpening: (kind: Opening["kind"], wall?: WallSide) => void;
  updateOpening: (id: string, patch: Partial<Opening>, coalesceKey?: string) => void;
  /** Move a wall's inner face to `pos` (see `moveWall` in geometry). */
  moveWall: (wall: WallSide, pos: number, coalesceKey?: string) => void;
  addAlcove: (wall: WallSide) => void;
  updateAlcove: (id: string, patch: Partial<Alcove>, coalesceKey?: string) => void;
  /** Step a door (an opening, or a space's door, by id) through its four hinge/swing orientations. */
  flipDoor: (id: string) => void;
  addSpace: (kind: SpaceKind) => void;
  updateSpace: (id: string, patch: Partial<Space>, coalesceKey?: string) => void;
  loadScene: (scene: Scene) => void;
  resetToExample: () => void;
  loadTemplate: (id: string) => void;
  clearRoom: () => void;
  markSaved: () => void;
}

const defaultPrefs: Prefs = {
  view: "3d",
  unit: "cm",
  gridSnap: true,
  gridSize: 5,
  wallSnap: true,
  wallVisibility: "auto",
  showDimensions: true,
};

function loadPersisted(): { scene: Scene; prefs: Prefs } {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const scene = validateScene(data.scene);
        if (scene) return { scene, prefs: { ...defaultPrefs, ...(data.prefs ?? {}) } };
      }
    } catch {
      // Corrupt or unavailable storage: fall back to the example room.
    }
  }
  return { scene: exampleScene(), prefs: defaultPrefs };
}

let lastKey: string | undefined;
let lastTime = 0;
let gesturePending = false;

const pushPast = (past: Scene[], scene: Scene) => [...past.slice(-(HISTORY_LIMIT - 1)), scene];

const initial = loadPersisted();

export const usePlanner = create<PlannerState>()((set, get) => ({
  ...initial.prefs,
  scene: initial.scene,
  past: [],
  future: [],
  selection: null,
  dragging: false,
  savedAt: null,

  setPref: (key, value) => set({ [key]: value } as Partial<PlannerState>),
  select: (selection) => set({ selection }),
  setDragging: (dragging) => set({ dragging }),

  commit: (fn, coalesceKey) => {
    const { scene, past } = get();
    const next = fn(scene);
    if (next === scene) return;
    const now = Date.now();
    const merge = coalesceKey !== undefined && coalesceKey === lastKey && now - lastTime < COALESCE_MS;
    lastKey = coalesceKey;
    lastTime = now;
    set({ scene: next, past: merge ? past : pushPast(past, scene), future: [] });
  },

  beginGesture: () => {
    gesturePending = true;
    lastKey = undefined;
  },
  gestureUpdate: (fn) => {
    const { scene, past } = get();
    const next = fn(scene);
    if (next === scene) return;
    if (gesturePending) {
      gesturePending = false;
      set({ scene: next, past: pushPast(past, scene), future: [] });
    } else {
      set({ scene: next });
    }
  },
  endGesture: () => {
    gesturePending = false;
  },

  undo: () => {
    const { past, future, scene, selection } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    lastKey = undefined;
    set({ scene: prev, past: past.slice(0, -1), future: [scene, ...future], selection: keepSelection(prev, selection) });
  },
  redo: () => {
    const { past, future, scene, selection } = get();
    if (!future.length) return;
    const next = future[0];
    lastKey = undefined;
    set({ scene: next, past: pushPast(past, scene), future: future.slice(1), selection: keepSelection(next, selection) });
  },

  updateRoom: (patch, coalesceKey) => get().commit((s) => withRoom(s, { ...s.room, ...patch }), coalesceKey),

  moveWall: (wall, pos, coalesceKey) => get().commit((s) => moveWallTo(s, wall, pos).scene, coalesceKey),

  addAlcove: (wall) => {
    const room = get().scene.room;
    const len = wallLength(room, wall);
    const width = Math.min(150, len);
    const id = nanoid(8);
    get().updateRoom({ alcoves: [...room.alcoves, { id, wall, offset: round1((len - width) / 2), width, depth: 60, window: null }] });
    set({ selection: { kind: "alcove", id } });
  },

  flipDoor: (id) =>
    get().commit((s) => {
      const next = <T extends { hinge: "start" | "end"; swing?: DoorSwing }>(d: T): T => {
        const i = DOOR_CYCLE.findIndex((c) => c.hinge === d.hinge && c.swing === (d.swing ?? "in"));
        return { ...d, ...DOOR_CYCLE[(i + 1) % DOOR_CYCLE.length] };
      };
      if (s.openings.some((o) => o.id === id)) return { ...s, openings: s.openings.map((o) => (o.id === id && o.kind === "door" ? next(o) : o)) };
      return { ...s, room: { ...s.room, spaces: s.room.spaces.map((sp) => (sp.id === id && sp.door ? { ...sp, door: next(sp.door) } : sp)) } };
    }),

  addSpace: (kind) => {
    const { room, furniture } = get().scene;
    const preset = SPACE_PRESETS[kind];
    const width = Math.min(preset.width, room.width);
    const length = Math.min(preset.length, room.length);
    // Try each inside corner and take the one that covers the least furniture.
    const corners = [
      { x: room.width - width, z: 0, door: "south" as const },
      { x: 0, z: 0, door: "south" as const },
      { x: room.width - width, z: room.length - length, door: "north" as const },
      { x: 0, z: room.length - length, door: "north" as const },
    ];
    const covered = (c: { x: number; z: number }) => {
      const r = spaceRect({ x: c.x, z: c.z, width, length } as Space);
      const box = [{ x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ }];
      return furniture.filter((f) => polygonsOverlap(box, footprint(f))).length;
    };
    const at = corners.reduce((best, c) => (covered(c) < covered(best) ? c : best));
    const count = room.spaces.filter((sp) => sp.kind === kind).length;
    const doorW = Math.min(kind === "closet" ? 80 : 70, width - 10);
    const space: Space = clampSpace(room, {
      id: nanoid(8),
      name: count ? `${preset.name} ${count + 1}` : preset.name,
      kind,
      x: round1(at.x),
      z: round1(at.z),
      width,
      length,
      floor: kind === "bathroom" ? "tile" : room.floor,
      // The door goes in the wall facing the rest of the room, away from the corner.
      door: { wall: at.door, offset: at.x === 0 ? width - doorW / 2 - 10 : doorW / 2 + 10, width: doorW, hinge: at.x === 0 ? "end" : "start", swing: preset.swing },
    });
    get().commit((s) => ({ ...s, room: { ...s.room, spaces: [...s.room.spaces, space] } }));
    set({ selection: { kind: "space", id: space.id } });
  },

  updateSpace: (id, patch, coalesceKey) =>
    get().commit(
      (s) => ({ ...s, room: { ...s.room, spaces: s.room.spaces.map((sp) => (sp.id === id ? clampSpace(s.room, { ...sp, ...patch }) : sp)) } }),
      coalesceKey,
    ),

  updateAlcove: (id, patch, coalesceKey) =>
    get().commit(
      (s) => ({ ...s, room: { ...s.room, alcoves: s.room.alcoves.map((a) => (a.id === id ? clampAlcove(s.room, { ...a, ...patch }) : a)) } }),
      coalesceKey,
    ),

  addFurniture: (catalogId, at) => {
    const c = catalogEntry(catalogId);
    if (!c) return null;
    const { scene } = get();
    const id = nanoid(8);
    const base: FurnitureItem = {
      id,
      type: c.type,
      catalogId: c.id,
      name: c.name,
      x: 0,
      z: 0,
      rotation: 0,
      width: c.width,
      depth: c.depth,
      height: c.height,
      elevation: c.ceiling ? Math.max(0, scene.room.height - c.height) : (c.elevation ?? 0),
      color: c.color,
    };
    // Wall pieces added with a click go flat against a free wall; dropped ones stay where they land.
    const onWall = !at && c.wall ? findWallSpot(base, scene.room, scene.furniture, scene.openings) : null;
    const pos = at ?? onWall ?? findFreeSpot(base, scene.room, scene.furniture, { x: scene.room.width / 2, z: scene.room.length / 2 });
    const item: FurnitureItem = { ...base, ...onWall, x: round1(pos.x!), z: round1(pos.z!) };
    get().commit((s) => ({ ...s, furniture: [...s.furniture, item] }));
    set({ selection: { kind: "furniture", id } });
    return id;
  },

  updateFurniture: (id, patch, coalesceKey) =>
    get().commit(
      (s) => ({ ...s, furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
      coalesceKey,
    ),

  duplicateSelected: () => {
    const { selection, scene } = get();
    if (selection?.kind !== "furniture") return;
    const src = scene.furniture.find((f) => f.id === selection.id);
    if (!src) return;
    const id = nanoid(8);
    const others = scene.furniture;
    const pos = findFreeSpot(src, scene.room, others, { x: src.x + 20, z: src.z + 20 });
    const copy = { ...src, id, x: round1(pos.x), z: round1(pos.z) };
    get().commit((s) => ({ ...s, furniture: [...s.furniture, copy] }));
    set({ selection: { kind: "furniture", id } });
  },

  deleteSelected: () => {
    const { selection } = get();
    if (!selection) return;
    if (selection.kind === "wall") return; // The room always keeps its four walls.
    if (selection.kind === "furniture") {
      get().commit((s) => ({ ...s, furniture: s.furniture.filter((f) => f.id !== selection.id) }));
    } else if (selection.kind === "space") {
      get().commit((s) => ({ ...s, room: { ...s.room, spaces: s.room.spaces.filter((sp) => sp.id !== selection.id) } }));
    } else if (selection.kind === "alcove") {
      get().commit((s) => ({ ...s, room: { ...s.room, alcoves: s.room.alcoves.filter((a) => a.id !== selection.id) } }));
    } else {
      get().commit((s) => ({ ...s, openings: s.openings.filter((o) => o.id !== selection.id) }));
    }
    set({ selection: null });
  },

  rotateSelected: (deg) => {
    const { selection, scene } = get();
    if (selection?.kind !== "furniture") return;
    const it = scene.furniture.find((f) => f.id === selection.id);
    if (!it) return;
    get().updateFurniture(it.id, { rotation: normalizeAngle(it.rotation + deg) });
  },

  addOpening: (kind, wall) => {
    const { scene } = get();
    const room = scene.room;
    const w: WallSide = wall ?? pickFreeWall(scene, kind);
    const len = wallLength(room, w);
    const width = Math.min(kind === "door" ? 80 : 100, len);
    const height = kind === "door" ? Math.min(205, room.height - 5) : Math.min(120, room.height - 100);
    const sill = kind === "door" ? 0 : 90;
    const id = nanoid(8);
    const opening: Opening = { id, kind, wall: w, offset: len / 2, width, height, sill, hinge: "start", ...(kind === "door" ? { swing: "in" as const } : {}) };
    get().commit((s) => ({ ...s, openings: [...s.openings, opening] }));
    set({ selection: { kind: "opening", id } });
  },

  updateOpening: (id, patch, coalesceKey) =>
    get().commit((s) => ({
      ...s,
      openings: s.openings.map((o) => {
        if (o.id !== id) return o;
        const next = { ...o, ...patch };
        next.width = Math.max(30, Math.min(next.width, wallLength(s.room, next.wall)));
        next.sill = Math.max(0, Math.min(next.sill, s.room.height - 20));
        next.height = Math.max(20, Math.min(next.height, s.room.height - next.sill));
        next.offset = clampOpeningOffset(s.room, next, next.offset);
        return next;
      }),
    }), coalesceKey),

  loadScene: (scene) => {
    get().commit(() => scene);
    set({ selection: null });
  },
  resetToExample: () => get().loadScene(exampleScene()),
  loadTemplate: (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (t) get().loadScene(t.build());
  },
  clearRoom: () => get().commit((s) => ({ ...s, furniture: [] })),
  markSaved: () => set({ savedAt: Date.now() }),
}));

function keepSelection(scene: Scene, sel: Selection): Selection {
  if (!sel || sel.kind === "wall") return sel;
  const list =
    sel.kind === "furniture" ? scene.furniture : sel.kind === "alcove" ? scene.room.alcoves : sel.kind === "space" ? scene.room.spaces : scene.openings;
  return list.some((x) => x.id === sel.id) ? sel : null;
}


/** Clockwise round the four ways a single door can hang. */
const DOOR_CYCLE: { hinge: "start" | "end"; swing: DoorSwing }[] = [
  { hinge: "start", swing: "in" },
  { hinge: "end", swing: "in" },
  { hinge: "end", swing: "out" },
  { hinge: "start", swing: "out" },
];

const SPACE_PRESETS: Record<SpaceKind, { name: string; width: number; length: number; swing: DoorSwing }> = {
  bathroom: { name: "Bathroom", width: 200, length: 170, swing: "in" },
  closet: { name: "Closet", width: 160, length: 120, swing: "out" },
  room: { name: "Small room", width: 250, length: 220, swing: "in" },
};

function pickFreeWall(scene: Scene, kind: Opening["kind"]): WallSide {
  const walls: WallSide[] = kind === "door" ? ["south", "west", "east", "north"] : ["north", "east", "west", "south"];
  const counts = new Map(walls.map((w) => [w, scene.openings.filter((o) => o.wall === w).length]));
  return [...walls].sort((a, b) => counts.get(a)! - counts.get(b)!)[0];
}



export function persist(state: PlannerState) {
  try {
    const prefs: Prefs = {
      view: state.view,
      unit: state.unit,
      gridSnap: state.gridSnap,
      gridSize: state.gridSize,
      wallSnap: state.wallSnap,
      wallVisibility: state.wallVisibility,
      showDimensions: state.showDimensions,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ scene: state.scene, prefs }));
    return true;
  } catch {
    return false;
  }
}
