import { create } from "zustand";
import { nanoid } from "nanoid";
import { catalogEntry } from "./catalog";
import { exampleScene } from "./example";
import { clampOpeningOffset, findFreeSpot, round1, wallLength, type Vec2 } from "./geometry";
import type {
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
  loadScene: (scene: Scene) => void;
  resetToExample: () => void;
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

  updateRoom: (patch, coalesceKey) =>
    get().commit((s) => {
      const room = { ...s.room, ...patch };
      // Keep openings on their walls when the room shrinks.
      const openings = s.openings.map((o) => {
        const width = Math.min(o.width, wallLength(room, o.wall));
        const height = Math.min(o.height, room.height - o.sill);
        return { ...o, width, height, offset: clampOpeningOffset(room, { ...o, width }, o.offset) };
      });
      return { ...s, room, openings };
    }, coalesceKey),

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
      color: c.color,
    };
    const pos = at ?? findFreeSpot(base, scene.room, scene.furniture, { x: scene.room.width / 2, z: scene.room.length / 2 });
    const item = { ...base, x: round1(pos.x), z: round1(pos.z) };
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
    if (selection.kind === "furniture") {
      get().commit((s) => ({ ...s, furniture: s.furniture.filter((f) => f.id !== selection.id) }));
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
    const opening: Opening = { id, kind, wall: w, offset: len / 2, width, height, sill, hinge: "start" };
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
  clearRoom: () => get().commit((s) => ({ ...s, furniture: [] })),
  markSaved: () => set({ savedAt: Date.now() }),
}));

function keepSelection(scene: Scene, sel: Selection): Selection {
  if (!sel) return null;
  const list = sel.kind === "furniture" ? scene.furniture : scene.openings;
  return list.some((x) => x.id === sel.id) ? sel : null;
}

export function normalizeAngle(deg: number) {
  const r = ((deg % 360) + 360) % 360;
  return Math.round(r * 10) / 10;
}

function pickFreeWall(scene: Scene, kind: Opening["kind"]): WallSide {
  const walls: WallSide[] = kind === "door" ? ["south", "west", "east", "north"] : ["north", "east", "west", "south"];
  const counts = new Map(walls.map((w) => [w, scene.openings.filter((o) => o.wall === w).length]));
  return [...walls].sort((a, b) => counts.get(a)! - counts.get(b)!)[0];
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
