"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanner, normalizeAngle } from "@/lib/store";
import { viewBridge } from "@/lib/bridge";
import {
  aabb,
  alcoveRect,
  spaceRect,
  clampAlcove,
  clampOpeningOffset,
  halfExtents,
  moveWall,
  surfaceElevations,
  nearestWall,
  round1,
  snapPosition,
  wallFrame,
  wallLength,
  wallPosition,
  clampSpace,
  MIN_SPACE,
  type Vec2,
  type WallFrame,
} from "@/lib/geometry";
import { floorDataUrl, FLOOR_TILE_CM } from "@/lib/textures";
import { formatLength } from "@/lib/units";
import { isFloorCovering } from "@/lib/catalog";
import type { Alcove, DoorSwing, FloorMaterial, FurnitureItem, Opening, Room, Scene, Selection, Space, Unit, WallSide } from "@/lib/types";
import { PlanSymbol } from "./PlanSymbol";
import { useWarnings } from "../planner/useWarnings";
import { PeerSelections, PlanCursors } from "../collab/RemoteCursors";

const WALL = 12;
const ACCENT = "#2f6fed";
const WARN = "#dc4a3d";
const FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

type Camera = { s: number; tx: number; ty: number };

type AlcoveEdge = "start" | "end" | "back";
/** What a piece of wall belongs to: one of the room's four walls, or one edge of an alcove. */
type WallOwner = { kind: "wall"; wall: WallSide } | { kind: "alcove"; id: string; edge: AlcoveEdge };
type WallRect = { x: number; y: number; w: number; h: number; owner: WallOwner };

const isHorizontal = (w: WallSide) => w === "north" || w === "south";
const ownerKey = (o: WallOwner) => (o.kind === "wall" ? o.wall : `${o.id}:${o.edge}`);
const ownerCursor = (o: WallOwner, room: Room) => {
  const wall = o.kind === "wall" ? o.wall : room.alcoves.find((a) => a.id === o.id)?.wall ?? "north";
  // An alcove's side walls run across its parent wall, so they drag the other way.
  const acrossParent = o.kind === "alcove" && o.edge !== "back";
  return isHorizontal(wall) !== acrossParent ? "ns-resize" : "ew-resize";
};

type Gesture =
  | { kind: "pan"; startX: number; startY: number; cam: Camera; moved: boolean }
  | { kind: "move"; id: string; offset: Vec2 }
  | { kind: "resize"; id: string; axis: "x" | "z"; sign: 1 | -1 }
  | { kind: "rotate"; id: string }
  | { kind: "opening"; id: string; grab: number }
  /** Moving a room wall re-bases the plan, so it works from the scene and camera at the start of the drag. */
  | { kind: "wall"; wall: WallSide; start: Scene; cam: Camera; grab: number }
  | { kind: "alcove"; id: string; edge: AlcoveEdge; start: Alcove; grab: number }
  | { kind: "space-move"; id: string; offset: Vec2 }
  | { kind: "space-edge"; id: string; wall: WallSide; start: Space; grab: number }
  | { kind: "space-door"; id: string; grab: number };

export default function PlanView() {
  const scene = usePlanner((s) => s.scene);
  const selection = usePlanner((s) => s.selection);
  const unit = usePlanner((s) => s.unit);
  const showDims = usePlanner((s) => s.showDimensions);
  const { byItem } = useWarnings();
  const { room, furniture, openings } = scene;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // A user-adjusted camera is tied to the layout it was made for; when the
  // viewport or room size changes the view falls back to fitting the room.
  const [userCam, setUserCam] = useState<{ key: string; cam: Camera } | null>(null);
  // While a wall is dragged the room size changes every frame; the camera is
  // held here instead of refitting, so the wall stays under the pointer.
  const [dragCam, setDragCam] = useState<Camera | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const camRef = useRef<Camera | null>(null);

  // Frame the room plus anything built onto it outside its walls.
  const bounds = useMemo(() => {
    const rects = [{ minX: 0, maxX: room.width, minZ: 0, maxZ: room.length }, ...room.alcoves.map((a) => alcoveRect(room, a)), ...room.spaces.map(spaceRect)];
    return {
      minX: Math.min(...rects.map((r) => r.minX)),
      maxX: Math.max(...rects.map((r) => r.maxX)),
      minZ: Math.min(...rects.map((r) => r.minZ)),
      maxZ: Math.max(...rects.map((r) => r.maxZ)),
    };
  }, [room]);
  const fit = useCallback(
    (w = size.w, h = size.h): Camera => {
      const margin = 90;
      const bw = bounds.maxX - bounds.minX;
      const bh = bounds.maxZ - bounds.minZ;
      const s = Math.min(w / (bw + margin * 2), h / (bh + margin * 2));
      return { s, tx: (w - bw * s) / 2 - bounds.minX * s, ty: (h - bh * s) / 2 - bounds.minZ * s };
    },
    [bounds, size.w, size.h],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Refit when the viewport or the room dimensions change.
  const keyFor = (r: Room) => `${size.w}x${size.h}:${r.width}x${r.length}`;
  const layoutKey = keyFor(room);
  const cam = dragCam ?? (userCam?.key === layoutKey ? userCam.cam : fit());
  useEffect(() => {
    camRef.current = cam;
  });
  const setCam = useCallback(
    (next: Camera | ((c: Camera) => Camera)) => {
      const base = camRef.current ?? fit();
      const value = typeof next === "function" ? next(base) : next;
      camRef.current = value;
      setUserCam({ key: layoutKey, cam: value });
    },
    [fit, layoutKey],
  );

  const toPlan = useCallback((clientX: number, clientY: number): Vec2 | null => {
    const el = svgRef.current;
    const c = camRef.current;
    if (!el || !c) return null;
    const r = el.getBoundingClientRect();
    return { x: (clientX - r.left - c.tx) / c.s, z: (clientY - r.top - c.ty) / c.s };
  }, []);

  const zoomAt = useCallback((factor: number, sx?: number, sy?: number) => {
    setCam((c) => {
      const ns = Math.min(12, Math.max(0.2, c.s * factor));
      const el = svgRef.current!;
      const px = sx ?? el.clientWidth / 2;
      const py = sy ?? el.clientHeight / 2;
      const f = ns / c.s;
      return { s: ns, tx: px - (px - c.tx) * f, ty: py - (py - c.ty) * f };
    });
  }, [setCam]);

  useEffect(() => {
    viewBridge.screenToFloor = toPlan;
    viewBridge.resetCamera = () => setUserCam(null);
    viewBridge.zoom = (f) => zoomAt(f);
    viewBridge.screenshot = () => exportSvgPng(svgRef.current!);
    return () => {
      viewBridge.screenToFloor = null;
      viewBridge.resetCamera = null;
      viewBridge.zoom = null;
      viewBridge.screenshot = null;
    };
  }, [toPlan, zoomAt]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) > 0) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const store = usePlanner.getState;

  const startGesture = (e: React.PointerEvent, g: Gesture) => {
    e.stopPropagation();
    if (g.kind !== "pan") {
      store().beginGesture();
      store().setDragging(true);
    }
    gesture.current = g;
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; moves still arrive while over the SVG.
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const st = store();
    if (g.kind === "pan") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      setCam({ ...g.cam, tx: g.cam.tx + dx, ty: g.cam.ty + dy });
      return;
    }
    const p = toPlan(e.clientX, e.clientY);
    if (!p) return;
    const grid = st.gridSnap ? st.gridSize : null;

    if (g.kind === "move") {
      st.gestureUpdate((s) => {
        const it = s.furniture.find((f) => f.id === g.id);
        if (!it) return s;
        const target = { x: p.x + g.offset.x, z: p.z + g.offset.z };
        const snapped = e.altKey ? { x: round1(target.x), z: round1(target.z) } : snapPosition(it, target, s.room, s.furniture, { grid, walls: st.wallSnap });
        if (snapped.x === it.x && snapped.z === it.z) return s;
        return { ...s, furniture: s.furniture.map((f) => (f.id === g.id ? { ...f, ...snapped } : f)) };
      });
    } else if (g.kind === "resize") {
      st.gestureUpdate((s) => {
        const it = s.furniture.find((f) => f.id === g.id);
        if (!it) return s;
        const rad = (it.rotation * Math.PI) / 180;
        const c = Math.cos(rad);
        const sn = Math.sin(rad);
        const dx = p.x - it.x;
        const dz = p.z - it.z;
        // Pointer in the item's local frame.
        const lx = dx * c + dz * sn;
        const lz = -dx * sn + dz * c;
        const half = g.axis === "x" ? it.width / 2 : it.depth / 2;
        const local = g.axis === "x" ? lx : lz;
        let size = Math.max(10, g.sign * local + half);
        if (grid && !e.altKey) size = Math.max(grid, Math.round(size / grid) * grid);
        size = round1(size);
        const delta = (size - half * 2) / 2; // centre shift along the local axis, keeping the far edge fixed
        const ax = g.axis === "x" ? { x: c, z: sn } : { x: -sn, z: c };
        const patch = g.axis === "x" ? { width: size } : { depth: size };
        return {
          ...s,
          furniture: s.furniture.map((f) =>
            f.id === g.id ? { ...f, ...patch, x: round1(f.x + ax.x * delta * g.sign), z: round1(f.z + ax.z * delta * g.sign) } : f,
          ),
        };
      });
    } else if (g.kind === "rotate") {
      st.gestureUpdate((s) => {
        const it = s.furniture.find((f) => f.id === g.id);
        if (!it) return s;
        let deg = (Math.atan2(p.x - it.x, -(p.z - it.z)) * 180) / Math.PI;
        deg = e.shiftKey ? Math.round(deg) : Math.round(deg / 15) * 15;
        const rotation = normalizeAngle(deg);
        if (rotation === it.rotation) return s;
        return { ...s, furniture: s.furniture.map((f) => (f.id === g.id ? { ...f, rotation } : f)) };
      });
    } else if (g.kind === "wall") {
      // Measure in the frame the drag started in; moving the west or north wall moves the origin.
      const r = svgRef.current!.getBoundingClientRect();
      const q = { x: (e.clientX - r.left - g.cam.tx) / g.cam.s, z: (e.clientY - r.top - g.cam.ty) / g.cam.s };
      let pos = (isHorizontal(g.wall) ? q.z : q.x) + g.grab;
      if (grid && !e.altKey) {
        // Snap the resulting room size, not the raw coordinate.
        const far = g.wall === "west" ? g.start.room.width : g.wall === "north" ? g.start.room.length : 0;
        pos = far ? far - Math.round((far - pos) / grid) * grid : Math.round(pos / grid) * grid;
      }
      const { scene: next, shift } = moveWall(g.start, g.wall, pos);
      const held = { ...g.cam, tx: g.cam.tx + shift.x * g.cam.s, ty: g.cam.ty + shift.z * g.cam.s };
      // Update the ref now too: pointer-up may arrive before the next render.
      camRef.current = held;
      setDragCam(held);
      st.gestureUpdate((s) => (s.room.width === next.room.width && s.room.length === next.room.length ? s : next));
    } else if (g.kind === "alcove") {
      st.gestureUpdate((s) => {
        const a0 = g.start;
        const u = isHorizontal(a0.wall) ? p.x : p.z;
        const snap = (v: number) => (grid && !e.altKey ? Math.round(v / grid) * grid : round1(v));
        let patch: Partial<Alcove>;
        if (g.edge === "back") {
          patch = { depth: snap(outward(s.room, a0.wall, p) + g.grab) };
        } else if (g.edge === "start") {
          const end = a0.offset + a0.width;
          const offset = Math.max(0, Math.min(snap(u + g.grab), end - 30));
          patch = { offset, width: end - offset };
        } else {
          patch = { width: Math.min(wallLength(s.room, a0.wall) - a0.offset, Math.max(30, snap(u + g.grab) - a0.offset)) };
        }
        const cur = s.room.alcoves.find((a) => a.id === g.id);
        if (!cur) return s;
        const next = clampAlcove(s.room, { ...cur, ...patch });
        if (next.offset === cur.offset && next.width === cur.width && next.depth === cur.depth) return s;
        return { ...s, room: { ...s.room, alcoves: s.room.alcoves.map((a) => (a.id === g.id ? next : a)) } };
      });
    } else if (g.kind === "space-move" || g.kind === "space-edge") {
      st.gestureUpdate((s) => {
        const sp = s.room.spaces.find((x) => x.id === g.id);
        if (!sp) return s;
        const snapOn = !e.altKey;
        // Space edges snap to the main walls' inner and outer faces, otherwise to the grid.
        const wallHit = (v: number, axis: "x" | "z") => {
          if (!snapOn || !st.wallSnap) return null;
          const far = axis === "x" ? s.room.width : s.room.length;
          const hits = [0, far, -WALL, far + WALL].filter((t) => Math.abs(v - t) < 12);
          return hits.length ? hits.reduce((a, b) => (Math.abs(v - a) <= Math.abs(v - b) ? a : b)) : null;
        };
        const gridSnap = (v: number) => (snapOn && grid ? Math.round(v / grid) * grid : round1(v));
        const edgeSnap = (v: number, axis: "x" | "z") => wallHit(v, axis) ?? gridSnap(v);
        let patch: Partial<Space>;
        if (g.kind === "space-move") {
          const tx = p.x + g.offset.x;
          const tz = p.z + g.offset.z;
          // Pull whichever edge is nearer a wall flush against it; otherwise snap the near edge to the grid.
          const pick = (lo: number, size: number, axis: "x" | "z") => {
            const a = wallHit(lo, axis);
            const b = wallHit(lo + size, axis);
            if (a !== null && (b === null || Math.abs(a - lo) <= Math.abs(b - size - lo))) return a;
            if (b !== null) return b - size;
            return gridSnap(lo);
          };
          patch = { x: pick(tx, sp.width, "x"), z: pick(tz, sp.length, "z") };
        } else {
          const a0 = g.start;
          const v = (isHorizontal(g.wall) ? p.z : p.x) + g.grab;
          const axis = isHorizontal(g.wall) ? "z" : "x";
          const edge = edgeSnap(v, axis);
          if (g.wall === "east") patch = { width: Math.max(MIN_SPACE, edge - a0.x) };
          else if (g.wall === "south") patch = { length: Math.max(MIN_SPACE, edge - a0.z) };
          else if (g.wall === "west") {
            const x = Math.min(edge, a0.x + a0.width - MIN_SPACE);
            patch = { x, width: a0.x + a0.width - x };
          } else {
            const z = Math.min(edge, a0.z + a0.length - MIN_SPACE);
            patch = { z, length: a0.z + a0.length - z };
          }
        }
        const next = clampSpace(s.room, { ...sp, ...patch });
        if (next.x === sp.x && next.z === sp.z && next.width === sp.width && next.length === sp.length && next.door === sp.door) return s;
        return { ...s, room: { ...s.room, spaces: s.room.spaces.map((x) => (x.id === g.id ? next : x)) } };
      });
    } else if (g.kind === "space-door") {
      st.gestureUpdate((s) => {
        const sp = s.room.spaces.find((x) => x.id === g.id);
        if (!sp?.door) return s;
        const { wall, offset } = nearestWall(sp, p);
        let off = offset + (wall === sp.door.wall ? g.grab : 0);
        if (grid && !e.altKey) off = Math.round(off / grid) * grid;
        const next = clampSpace(s.room, { ...sp, door: { ...sp.door, wall, offset: round1(off) } });
        if (next.door!.wall === sp.door.wall && next.door!.offset === sp.door.offset) return s;
        return { ...s, room: { ...s.room, spaces: s.room.spaces.map((x) => (x.id === g.id ? next : x)) } };
      });
    } else if (g.kind === "opening") {
      st.gestureUpdate((s) => {
        const o = s.openings.find((x) => x.id === g.id);
        if (!o) return s;
        const { wall, offset } = nearestWall(s.room, p);
        const width = Math.min(o.width, wallLength(s.room, wall));
        let off = offset + (wall === o.wall ? g.grab : 0);
        if (grid && !e.altKey) off = Math.round(off / grid) * grid;
        off = round1(clampOpeningOffset(s.room, { wall, width }, off));
        if (wall === o.wall && off === o.offset) return s;
        return { ...s, openings: s.openings.map((x) => (x.id === g.id ? { ...x, wall, width, offset: off } : x)) };
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === "pan") {
      if (!g.moved) store().select(null);
    } else {
      if (g.kind === "wall" && camRef.current) {
        // Keep the view where the drag left it rather than refitting to the new size.
        setUserCam({ key: keyFor(store().scene.room), cam: camRef.current });
        setDragCam(null);
      }
      store().endGesture();
      store().setDragging(false);
    }
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    startGesture(e, { kind: "pan", startX: e.clientX, startY: e.clientY, cam, moved: false });
  };

  const onItemDown = (e: React.PointerEvent, it: FurnitureItem) => {
    if (e.button !== 0) return;
    store().select({ kind: "furniture", id: it.id });
    const p = toPlan(e.clientX, e.clientY)!;
    startGesture(e, { kind: "move", id: it.id, offset: { x: it.x - p.x, z: it.z - p.z } });
  };

  const onOpeningDown = (e: React.PointerEvent, o: Opening) => {
    if (e.button !== 0) return;
    store().select({ kind: "opening", id: o.id });
    const p = toPlan(e.clientX, e.clientY)!;
    const along = o.wall === "north" || o.wall === "south" ? p.x : p.z;
    startGesture(e, { kind: "opening", id: o.id, grab: o.offset - along });
  };

  const onWallDown = (e: React.PointerEvent, owner: WallOwner) => {
    if (e.button !== 0) return;
    const p = toPlan(e.clientX, e.clientY)!;
    const { scene: s } = store();
    if (owner.kind === "wall") {
      store().select({ kind: "wall", wall: owner.wall });
      const grab = wallPosition(s.room, owner.wall) - (isHorizontal(owner.wall) ? p.z : p.x);
      startGesture(e, { kind: "wall", wall: owner.wall, start: s, cam, grab });
      return;
    }
    const a = s.room.alcoves.find((x) => x.id === owner.id);
    if (!a) return;
    setCam(cam);
    store().select({ kind: "alcove", id: a.id });
    const u = isHorizontal(a.wall) ? p.x : p.z;
    const grab = owner.edge === "back" ? a.depth - outward(s.room, a.wall, p) : owner.edge === "start" ? a.offset - u : a.offset + a.width - u;
    startGesture(e, { kind: "alcove", id: a.id, edge: owner.edge, start: a, grab });
  };

  const onSpaceDown = (e: React.PointerEvent, sp: Space, part: "floor" | "door" | WallSide) => {
    if (e.button !== 0) return;
    // Pin the view: the fit includes spaces, so it would otherwise chase the drag.
    setCam(cam);
    store().select({ kind: "space", id: sp.id });
    const p = toPlan(e.clientX, e.clientY)!;
    if (part === "floor") return startGesture(e, { kind: "space-move", id: sp.id, offset: { x: sp.x - p.x, z: sp.z - p.z } });
    if (part === "door") {
      const along = isHorizontal(sp.door!.wall) ? p.x - sp.x : p.z - sp.z;
      return startGesture(e, { kind: "space-door", id: sp.id, grab: sp.door!.offset - along });
    }
    const face = part === "north" ? sp.z : part === "south" ? sp.z + sp.length : part === "west" ? sp.x : sp.x + sp.width;
    startGesture(e, { kind: "space-edge", id: sp.id, wall: part, start: sp, grab: face - (isHorizontal(part) ? p.z : p.x) });
  };

  const px = 1 / cam.s;
  // Draw rugs first, then by top height, so a lamp on a nightstand stays visible.
  const sorted = useMemo(() => {
    const elev = surfaceElevations(furniture);
    const top = (f: FurnitureItem) => (elev.get(f.id) ?? 0) + f.height;
    return [...furniture].sort((a, b) => Number(isFloorCovering(b.type)) - Number(isFloorCovering(a.type)) || top(a) - top(b));
  }, [furniture]);
  const selectedItem = selection?.kind === "furniture" ? furniture.find((f) => f.id === selection.id) : undefined;
  const selectedOpening = selection?.kind === "opening" ? openings.find((o) => o.id === selection.id) : undefined;
  const tile = FLOOR_TILE_CM[room.floor];
  const floorRects = [{ minX: 0, maxX: room.width, minZ: 0, maxZ: room.length }, ...room.alcoves.map((a) => alcoveRect(room, a))];
  const selectedSpace = selection?.kind === "space" ? room.spaces.find((sp) => sp.id === selection.id) : undefined;
  const spaceFloors = [...new Set(room.spaces.map((sp) => sp.floor).filter((f) => f !== room.floor))];

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-[#f4f2ee]">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block touch-none select-none"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        fontFamily={FONT}
      >
        <rect width={size.w} height={size.h} fill="#f4f2ee" />
        {(
          <g transform={`translate(${cam.tx} ${cam.ty}) scale(${cam.s})`}>
            <defs>
              <pattern id="floor" patternUnits="userSpaceOnUse" width={tile} height={tile}>
                <image href={floorDataUrl(room.floor)} width={tile} height={tile} preserveAspectRatio="none" />
              </pattern>
              {spaceFloors.map((f) => (
                <pattern key={f} id={`floor-${f}`} patternUnits="userSpaceOnUse" width={FLOOR_TILE_CM[f]} height={FLOOR_TILE_CM[f]}>
                  <image href={floorDataUrl(f)} width={FLOOR_TILE_CM[f]} height={FLOOR_TILE_CM[f]} preserveAspectRatio="none" />
                </pattern>
              ))}
              <pattern id="grid" patternUnits="userSpaceOnUse" width={50} height={50}>
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#000" strokeOpacity={0.08} strokeWidth={px} />
              </pattern>
            </defs>

            {floorRects.map((r, i) => (
              <g key={i}>
                <rect x={r.minX} y={r.minZ} width={r.maxX - r.minX} height={r.maxZ - r.minZ} fill="url(#floor)" />
                <rect x={r.minX} y={r.minZ} width={r.maxX - r.minX} height={r.maxZ - r.minZ} fill="#ffffff" fillOpacity={0.35} />
                <rect x={r.minX} y={r.minZ} width={r.maxX - r.minX} height={r.maxZ - r.minZ} fill="url(#grid)" />
              </g>
            ))}

            {room.spaces.map((sp) => (
              <SpaceShape key={sp.id} sp={sp} mainFloor={room.floor} px={px} selected={selectedSpace?.id === sp.id} onPointerDown={(e, part) => onSpaceDown(e, sp, part)} />
            ))}

            <Walls room={room} selection={selection} px={px} onPointerDown={onWallDown} />
            {room.alcoves.map((a) => (
              <AlcoveWindow key={a.id} room={room} a={a} px={px} />
            ))}

            {room.spaces.map((sp) =>
              sp.door ? (
                <OpeningSymbol
                  key={`d-${sp.id}`}
                  f={wallFrame(sp, sp.door.wall)}
                  o={{ kind: "door", ...sp.door }}
                  px={px}
                  selected={selectedSpace?.id === sp.id}
                  onPointerDown={(e) => onSpaceDown(e, sp, "door")}
                />
              ) : null,
            )}

            {openings.map((o) => (
              <OpeningSymbol
                key={o.id}
                f={wallFrame(room, o.wall)}
                o={o}
                px={px}
                selected={selectedOpening?.id === o.id}
                onPointerDown={(e) => onOpeningDown(e, o)}
              />
            ))}

            {sorted.map((it) => {
              const warn = byItem.has(it.id);
              const sel = selectedItem?.id === it.id;
              return (
                <g
                  key={it.id}
                  transform={`translate(${it.x} ${it.z}) rotate(${it.rotation})`}
                  onPointerDown={(e) => onItemDown(e, it)}
                  style={{ cursor: "move" }}
                  opacity={isFloorCovering(it.type) ? 0.95 : 1}
                >
                  <PlanSymbol type={it.type} w={it.width} d={it.depth} color={it.color} px={px} />
                  {(warn || sel) && (
                    <rect
                      x={-it.width / 2 - 2 * px}
                      y={-it.depth / 2 - 2 * px}
                      width={it.width + 4 * px}
                      height={it.depth + 4 * px}
                      rx={2 * px}
                      fill={warn ? WARN : ACCENT}
                      fillOpacity={0.08}
                      stroke={warn ? WARN : ACCENT}
                      strokeWidth={2 * px}
                      strokeDasharray={warn && !sel ? `${5 * px} ${3 * px}` : undefined}
                    />
                  )}
                </g>
              );
            })}

            {/* Labels sit above every symbol so overlapping items stay readable. */}
            {sorted.map((it) => {
              // Only label items wide enough (along their screen-horizontal extent) to fit the name.
              const { hx, hz } = halfExtents(it);
              if (isFloorCovering(it.type) || (hx * 2) / px < it.name.length * 6.3 + 8 || (hz * 2) / px < 18) return null;
              return (
                <text
                  key={`l-${it.id}`}
                  x={it.x}
                  y={it.z}
                  fontSize={11 * px}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#2a2622"
                  stroke="#ffffff"
                  strokeOpacity={0.85}
                  strokeWidth={3 * px}
                  paintOrder="stroke"
                  pointerEvents="none"
                  fontWeight={500}
                >
                  {it.name}
                </text>
              );
            })}

            <PeerSelections furniture={furniture} spaces={room.spaces} px={px} />

            {showDims && <RoomDimensions room={room} unit={unit} px={px} />}
            {showDims && room.alcoves.map((a) => <AlcoveDimensions key={a.id} room={room} a={a} unit={unit} px={px} />)}
            {selectedItem && showDims && <ItemDimensions it={selectedItem} room={room} unit={unit} px={px} />}
            {selectedOpening && showDims && <OpeningDimensions o={selectedOpening} room={room} unit={unit} px={px} />}
            {selection?.kind === "wall" && <WallDimension room={room} wall={selection.wall} unit={unit} px={px} />}
            {selectedSpace && showDims && (
              <>
                <WallDimension room={selectedSpace} wall="north" unit={unit} px={px} />
                <WallDimension room={selectedSpace} wall="west" unit={unit} px={px} />
              </>
            )}

            {selectedItem && (
              <Handles
                it={selectedItem}
                px={px}
                onResize={(e, axis, sign) => startGesture(e, { kind: "resize", id: selectedItem.id, axis, sign })}
                onRotate={(e) => startGesture(e, { kind: "rotate", id: selectedItem.id })}
              />
            )}
          </g>
        )}
      </svg>
      <PlanCursors cam={cam} />
    </div>
  );
}

/** Plan rectangles for the room's walls, with gaps where alcoves open off them, plus each alcove's own walls. */
function wallRects(room: Room): WallRect[] {
  const t = WALL;
  const rects: WallRect[] = [];
  const W = room.width;
  const L = room.length;
  // Each main wall as a span along its axis, minus alcove mouths.
  const spans: { wall: Alcove["wall"]; from: number; to: number }[] = [
    { wall: "north", from: -t, to: W + t },
    { wall: "south", from: -t, to: W + t },
    { wall: "west", from: 0, to: L },
    { wall: "east", from: 0, to: L },
  ];
  for (const sp of spans) {
    const gaps = room.alcoves.filter((a) => a.wall === sp.wall).map((a) => [a.offset, a.offset + a.width] as const).sort((a, b) => a[0] - b[0]);
    let u = sp.from;
    const pieces: [number, number][] = [];
    for (const [a, b] of gaps) {
      if (a > u) pieces.push([u, a]);
      u = Math.max(u, b);
    }
    if (u < sp.to) pieces.push([u, sp.to]);
    const owner: WallOwner = { kind: "wall", wall: sp.wall };
    for (const [a, b] of pieces) {
      if (sp.wall === "north") rects.push({ x: a, y: -t, w: b - a, h: t, owner });
      if (sp.wall === "south") rects.push({ x: a, y: L, w: b - a, h: t, owner });
      if (sp.wall === "west") rects.push({ x: -t, y: a, w: t, h: b - a, owner });
      if (sp.wall === "east") rects.push({ x: W, y: a, w: t, h: b - a, owner });
    }
  }
  for (const a of room.alcoves) {
    const r = alcoveRect(room, a);
    const edge = (e: AlcoveEdge): WallOwner => ({ kind: "alcove", id: a.id, edge: e });
    if (isHorizontal(a.wall)) {
      const y0 = a.wall === "south" ? r.minZ : r.minZ - t;
      const h = a.depth + t;
      rects.push({ x: r.minX - t, y: y0, w: t, h, owner: edge("start") }, { x: r.maxX, y: y0, w: t, h, owner: edge("end") });
      rects.push({ x: r.minX - t, y: a.wall === "south" ? r.maxZ : r.minZ - t, w: a.width + 2 * t, h: t, owner: edge("back") });
    } else {
      const x0 = a.wall === "east" ? r.minX : r.minX - t;
      const w = a.depth + t;
      rects.push({ x: x0, y: r.minZ - t, w, h: t, owner: edge("start") }, { x: x0, y: r.maxZ, w, h: t, owner: edge("end") });
      rects.push({ x: a.wall === "east" ? r.maxX : r.minX - t, y: r.minZ - t, w: t, h: a.width + 2 * t, owner: edge("back") });
    }
  }
  return rects;
}

/**
 * A space's floor (drag to move), its four partition walls (drag to resize)
 * and its name. The door is drawn separately so it sits above the main walls.
 */
function SpaceShape({
  sp,
  mainFloor,
  px,
  selected,
  onPointerDown,
}: {
  sp: Space;
  mainFloor: FloorMaterial;
  px: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, part: "floor" | WallSide) => void;
}) {
  const t = WALL;
  const { x, z, width: w, length: l } = sp;
  const walls: { side: WallSide; r: { x: number; y: number; w: number; h: number } }[] = [
    { side: "north", r: { x: x - t, y: z - t, w: w + 2 * t, h: t } },
    { side: "south", r: { x: x - t, y: z + l, w: w + 2 * t, h: t } },
    { side: "west", r: { x: x - t, y: z, w: t, h: l } },
    { side: "east", r: { x: x + w, y: z, w: t, h: l } },
  ];
  const pad = 4 * px;
  const area = `${((w * l) / 10000).toFixed(1)} m²`;
  const showLabel = w / px > sp.name.length * 6.5 + 12 && l / px > 34;
  return (
    <g>
      <g style={{ cursor: "move" }} onPointerDown={(e) => onPointerDown(e, "floor")}>
        <rect x={x} y={z} width={w} height={l} fill={sp.floor === mainFloor ? "url(#floor)" : `url(#floor-${sp.floor})`} />
        <rect x={x} y={z} width={w} height={l} fill={selected ? ACCENT : "#ffffff"} fillOpacity={selected ? 0.08 : 0.35} />
        <rect x={x} y={z} width={w} height={l} fill="url(#grid)" />
      </g>
      {walls.map(({ side, r }) => (
        <g key={side} className="group" style={{ cursor: isHorizontal(side) ? "ns-resize" : "ew-resize" }} onPointerDown={(e) => onPointerDown(e, side)}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={selected ? ACCENT : "#3b3733"} />
          <rect x={r.x - pad} y={r.y - pad} width={r.w + pad * 2} height={r.h + pad * 2} className="fill-transparent group-hover:fill-[#2f6fed]/30" />
        </g>
      ))}
      {showLabel && (
        <text x={x + w / 2} y={z + l / 2} textAnchor="middle" pointerEvents="none" fill="#2a2622" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={3 * px} paintOrder="stroke">
          <tspan x={x + w / 2} dy={-2 * px} fontSize={12 * px} fontWeight={600}>
            {sp.name}
          </tspan>
          <tspan x={x + w / 2} dy={14 * px} fontSize={10 * px} fill="#6b645c">
            {area}
          </tspan>
        </text>
      )}
    </g>
  );
}

/** How far a plan point lies outside the room, measured straight out through `wall`. */
function outward(room: Room, wall: WallSide, p: Vec2) {
  return wall === "north" ? -p.z : wall === "south" ? p.z - room.length : wall === "west" ? -p.x : p.x - room.width;
}

function isOwnerSelected(o: WallOwner, sel: Selection) {
  if (o.kind === "wall") return sel?.kind === "wall" && sel.wall === o.wall;
  return sel?.kind === "alcove" && sel.id === o.id;
}

/**
 * The room's walls. Each wall, and each edge of an alcove, is a drag target:
 * pull a wall to resize the room, or an alcove's edges to resize the alcove.
 */
function Walls({
  room,
  selection,
  px,
  onPointerDown,
}: {
  room: Room;
  selection: Selection;
  px: number;
  onPointerDown: (e: React.PointerEvent, owner: WallOwner) => void;
}) {
  const rects = wallRects(room);
  const groups = new Map<string, WallRect[]>();
  for (const r of rects) groups.set(ownerKey(r.owner), [...(groups.get(ownerKey(r.owner)) ?? []), r]);
  const pad = 4 * px;
  const grip = (r: WallRect) => {
    // A small pill across the middle of the piece, hinting that it can be dragged.
    const long = Math.max(r.w, r.h);
    const len = Math.min(long * 0.6, 28 * px);
    const thick = 3 * px;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return r.w >= r.h ? (
      <rect key={`g${r.x},${r.y}`} x={cx - len / 2} y={cy - thick / 2} width={len} height={thick} rx={thick / 2} fill="#ffffff" />
    ) : (
      <rect key={`g${r.x},${r.y}`} x={cx - thick / 2} y={cy - len / 2} width={thick} height={len} rx={thick / 2} fill="#ffffff" />
    );
  };
  return (
    <g>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={isOwnerSelected(r.owner, selection) ? ACCENT : "#3b3733"} pointerEvents="none" />
      ))}
      {[...groups.entries()].map(([key, list]) => {
        const sel = isOwnerSelected(list[0].owner, selection);
        return (
          <g
            key={key}
            className="group"
            style={{ cursor: ownerCursor(list[0].owner, room) }}
            onPointerDown={(e) => onPointerDown(e, list[0].owner)}
          >
            {list.map((r, i) => (
              <rect
                key={i}
                x={r.x - pad}
                y={r.y - pad}
                width={r.w + pad * 2}
                height={r.h + pad * 2}
                className={sel ? "fill-transparent" : "fill-transparent group-hover:fill-[#2f6fed]/30"}
              />
            ))}
            {/* Only the longest piece of a wall split by alcoves gets a grip. */}
            {sel && <g pointerEvents="none">{grip(list.reduce((a, b) => (Math.max(b.w, b.h) > Math.max(a.w, a.h) ? b : a)))}</g>}
          </g>
        );
      })}
    </g>
  );
}

/** Length of the selected wall, drawn just inside it. */
function WallDimension({ room, wall, unit, px }: { room: Room | Space; wall: WallSide; unit: Unit; px: number }) {
  const f = wallFrame(room, wall);
  const len = wallLength(room, wall);
  const v = 24 * px;
  const at = (u: number) => ({ x: f.start.x + f.dir.x * u + f.inward.x * v, z: f.start.z + f.dir.z * u + f.inward.z * v });
  return <DimLine from={at(0)} to={at(len)} label={formatLength(len, unit)} px={px} color={ACCENT} />;
}

/** Window symbol on an alcove's back wall. */
function AlcoveWindow({ room, a, px }: { room: Room; a: Alcove; px: number }) {
  if (!a.window) return null;
  const r = alcoveRect(room, a);
  const t = WALL;
  const w = a.window.width;
  const horizontal = a.wall === "north" || a.wall === "south";
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const box = horizontal
    ? { x: cx - w / 2, y: a.wall === "south" ? r.maxZ : r.minZ - t, w, h: t }
    : { x: a.wall === "east" ? r.maxX : r.minX - t, y: cz - w / 2, w: t, h: w };
  const mid = horizontal ? { x1: box.x, x2: box.x + w, y1: box.y + t / 2, y2: box.y + t / 2 } : { x1: box.x + t / 2, x2: box.x + t / 2, y1: box.y, y2: box.y + w };
  return (
    <g pointerEvents="none">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#dbe9f6" stroke="#3b3733" strokeWidth={1.2 * px} />
      <line {...mid} stroke="#3b3733" strokeWidth={1.2 * px} />
    </g>
  );
}

function AlcoveDimensions({ room, a, unit, px }: { room: Room; a: Alcove; unit: Unit; px: number }) {
  const r = alcoveRect(room, a);
  const off = WALL + 22 * px;
  switch (a.wall) {
    case "south":
      return (
        <>
          <DimLine from={{ x: r.minX, z: r.maxZ + off }} to={{ x: r.maxX, z: r.maxZ + off }} label={formatLength(a.width, unit)} px={px} />
          <DimLine from={{ x: r.maxX + off, z: r.minZ }} to={{ x: r.maxX + off, z: r.maxZ }} label={formatLength(a.depth, unit)} px={px} />
        </>
      );
    case "north":
      return (
        <>
          <DimLine from={{ x: r.minX, z: r.minZ - off }} to={{ x: r.maxX, z: r.minZ - off }} label={formatLength(a.width, unit)} px={px} />
          <DimLine from={{ x: r.maxX + off, z: r.minZ }} to={{ x: r.maxX + off, z: r.maxZ }} label={formatLength(a.depth, unit)} px={px} />
        </>
      );
    case "west":
      return (
        <>
          <DimLine from={{ x: r.minX - off, z: r.maxZ }} to={{ x: r.minX - off, z: r.minZ }} label={formatLength(a.width, unit)} px={px} />
          <DimLine from={{ x: r.minX, z: r.maxZ + off }} to={{ x: r.maxX, z: r.maxZ + off }} label={formatLength(a.depth, unit)} px={px} />
        </>
      );
    case "east":
      return (
        <>
          <DimLine from={{ x: r.maxX + off, z: r.maxZ }} to={{ x: r.maxX + off, z: r.minZ }} label={formatLength(a.width, unit)} px={px} />
          <DimLine from={{ x: r.minX, z: r.maxZ + off }} to={{ x: r.maxX, z: r.maxZ + off }} label={formatLength(a.depth, unit)} px={px} />
        </>
      );
  }
}

type DoorLike = Pick<Opening, "kind" | "offset" | "width" | "hinge"> & { swing?: DoorSwing };

function OpeningSymbol({
  f,
  o,
  px,
  selected,
  onPointerDown,
}: {
  f: WallFrame;
  o: DoorLike;
  px: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  // Local frame: u along the wall from the start corner, v into the room.
  const angle = (Math.atan2(f.dir.z, f.dir.x) * 180) / Math.PI;
  const flip = f.dir.x * f.inward.z - f.dir.z * f.inward.x < 0 ? -1 : 1;
  const a = o.offset - o.width / 2;
  const stroke = selected ? ACCENT : "#3b3733";
  return (
    <g
      transform={`translate(${f.start.x} ${f.start.z}) rotate(${angle}) scale(1 ${flip})`}
      onPointerDown={onPointerDown}
      style={{ cursor: "ew-resize" }}
    >
      {/* Generous invisible hit area for easier grabbing. */}
      <rect
        x={a}
        y={o.kind === "door" && o.swing === "out" ? -WALL - 6 - o.width : -WALL - 6}
        width={o.width}
        height={WALL + 12 + (o.kind === "door" ? o.width : 0)}
        fill="transparent"
      />
      <rect x={a} y={-WALL} width={o.width} height={WALL} fill={o.kind === "door" ? "#f4f2ee" : "#dbe9f6"} stroke={stroke} strokeWidth={1.2 * px} />
      {o.kind === "window" ? (
        <>
          <line x1={a} x2={a + o.width} y1={-WALL / 2} y2={-WALL / 2} stroke={stroke} strokeWidth={1.2 * px} />
          <line x1={a} x2={a + o.width} y1={-WALL * 0.2} y2={-WALL * 0.2} stroke={stroke} strokeWidth={0.8 * px} />
        </>
      ) : (
        (() => {
          const hingeU = o.hinge === "start" ? a : a + o.width;
          const freeU = o.hinge === "start" ? a + o.width : a;
          const sweep = o.hinge === "start" ? 1 : 0;
          // An outward door is the same drawing mirrored onto the far face of the wall.
          return (
            <g transform={o.swing === "out" ? `translate(0 ${-WALL}) scale(1 -1)` : undefined}>
              <line x1={hingeU} y1={0} x2={hingeU} y2={o.width} stroke={stroke} strokeWidth={2.4 * px} />
              <path
                d={`M ${freeU} 0 A ${o.width} ${o.width} 0 0 ${sweep} ${hingeU} ${o.width}`}
                fill={selected ? ACCENT : "#3b3733"}
                fillOpacity={0.04}
                stroke={stroke}
                strokeWidth={1 * px}
                strokeDasharray={`${4 * px} ${3 * px}`}
              />
            </g>
          );
        })()
      )}
      {selected && <rect x={a - 2 * px} y={-WALL - 2 * px} width={o.width + 4 * px} height={WALL + 4 * px} fill="none" stroke={ACCENT} strokeWidth={2 * px} />}
    </g>
  );
}

function DimLine({
  from,
  to,
  label,
  px,
  offset = 0,
  color = "#5a544d",
  dashed = false,
}: {
  from: Vec2;
  to: Vec2;
  label: string;
  px: number;
  offset?: number;
  color?: string;
  dashed?: boolean;
}) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1) return null;
  const nx = (-dz / len) * offset;
  const nz = (dx / len) * offset;
  const a = { x: from.x + nx, z: from.z + nz };
  const b = { x: to.x + nx, z: to.z + nz };
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  let ang = (Math.atan2(dz, dx) * 180) / Math.PI;
  if (ang > 90 || ang <= -90) ang += 180;
  const tick = 5 * px;
  const tx = (-dz / len) * tick;
  const tz = (dx / len) * tick;
  const labelW = (label.length * 6.4 + 10) * px;
  const fits = len > labelW + 6 * px;
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke={color} strokeWidth={px} strokeDasharray={dashed ? `${3 * px} ${3 * px}` : undefined} />
      <line x1={a.x - tx} y1={a.z - tz} x2={a.x + tx} y2={a.z + tz} stroke={color} strokeWidth={px} />
      <line x1={b.x - tx} y1={b.z - tz} x2={b.x + tx} y2={b.z + tz} stroke={color} strokeWidth={px} />
      <g transform={`translate(${mid.x} ${mid.z}) rotate(${ang})`}>
        <rect x={-labelW / 2} y={fits ? -8 * px : -22 * px} width={labelW} height={16 * px} rx={8 * px} fill="#ffffff" stroke={color} strokeOpacity={0.25} strokeWidth={px} />
        <text y={fits ? 0 : -14 * px} fontSize={10.5 * px} textAnchor="middle" dominantBaseline="central" fill={color} fontWeight={600}>
          {label}
        </text>
      </g>
    </g>
  );
}

function RoomDimensions({ room, unit, px }: { room: Room; unit: Unit; px: number }) {
  const off = WALL + 26 * px;
  return (
    <>
      <DimLine from={{ x: 0, z: -off }} to={{ x: room.width, z: -off }} label={formatLength(room.width, unit)} px={px} />
      <DimLine from={{ x: -off, z: room.length }} to={{ x: -off, z: 0 }} label={formatLength(room.length, unit)} px={px} />
    </>
  );
}

function ItemDimensions({ it, room, unit, px }: { it: FurnitureItem; room: Room; unit: Unit; px: number }) {
  const b = aabb(it);
  // Clearance lines run off-centre so their labels don't sit on the item's own size labels.
  const cx = Math.min(Math.max(b.minX + (b.maxX - b.minX) * 0.3, 0), room.width);
  const cz = Math.min(Math.max(b.minZ + (b.maxZ - b.minZ) * 0.3, 0), room.length);
  const rad = (it.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const at = (lx: number, lz: number) => ({ x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c });
  const hw = it.width / 2;
  const hd = it.depth / 2;
  const off = 16 * px;
  const color = ACCENT;
  return (
    <g>
      {/* Item size along its own edges (front edge and right edge). */}
      <DimLine from={at(-hw, hd)} to={at(hw, hd)} label={formatLength(it.width, unit)} px={px} offset={off} color={color} />
      <DimLine from={at(hw, hd)} to={at(hw, -hd)} label={formatLength(it.depth, unit)} px={px} offset={off} color={color} />
      {/* Clearance to each wall. */}
      {b.minX > 1 && b.minX < room.width && <DimLine from={{ x: 0, z: cz }} to={{ x: b.minX, z: cz }} label={formatLength(b.minX, unit)} px={px} dashed color="#7a736b" />}
      {room.width - b.maxX > 1 && b.maxX > 0 && <DimLine from={{ x: b.maxX, z: cz }} to={{ x: room.width, z: cz }} label={formatLength(room.width - b.maxX, unit)} px={px} dashed color="#7a736b" />}
      {b.minZ > 1 && b.minZ < room.length && <DimLine from={{ x: cx, z: 0 }} to={{ x: cx, z: b.minZ }} label={formatLength(b.minZ, unit)} px={px} dashed color="#7a736b" />}
      {room.length - b.maxZ > 1 && b.maxZ > 0 && <DimLine from={{ x: cx, z: b.maxZ }} to={{ x: cx, z: room.length }} label={formatLength(room.length - b.maxZ, unit)} px={px} dashed color="#7a736b" />}
    </g>
  );
}

function OpeningDimensions({ o, room, unit, px }: { o: Opening; room: Room; unit: Unit; px: number }) {
  const f = wallFrame(room, o.wall);
  const len = wallLength(room, o.wall);
  const a = o.offset - o.width / 2;
  const b = o.offset + o.width / 2;
  const v = -(WALL + 18 * px);
  const at = (u: number) => ({ x: f.start.x + f.dir.x * u + f.inward.x * v, z: f.start.z + f.dir.z * u + f.inward.z * v });
  return (
    <g>
      <DimLine from={at(a)} to={at(b)} label={formatLength(o.width, unit)} px={px} color={ACCENT} />
      {a > 1 && <DimLine from={at(0)} to={at(a)} label={formatLength(a, unit)} px={px} dashed color="#7a736b" />}
      {len - b > 1 && <DimLine from={at(b)} to={at(len)} label={formatLength(len - b, unit)} px={px} dashed color="#7a736b" />}
    </g>
  );
}

function Handles({
  it,
  px,
  onResize,
  onRotate,
}: {
  it: FurnitureItem;
  px: number;
  onResize: (e: React.PointerEvent, axis: "x" | "z", sign: 1 | -1) => void;
  onRotate: (e: React.PointerEvent) => void;
}) {
  const hw = it.width / 2;
  const hd = it.depth / 2;
  const r = 5.5 * px;
  const handle = (x: number, y: number, axis: "x" | "z", sign: 1 | -1) => (
    <rect
      key={`${axis}${sign}`}
      x={x - r}
      y={y - r}
      width={r * 2}
      height={r * 2}
      rx={2 * px}
      fill="#ffffff"
      stroke={ACCENT}
      strokeWidth={1.6 * px}
      style={{ cursor: axisCursor(it.rotation, axis) }}
      onPointerDown={(e) => {
        if (e.button === 0) onResize(e, axis, sign);
      }}
    />
  );
  const rotY = -hd - 26 * px;
  return (
    <g transform={`translate(${it.x} ${it.z}) rotate(${it.rotation})`}>
      <line x1={0} y1={-hd - 2 * px} x2={0} y2={rotY + r} stroke={ACCENT} strokeWidth={1.4 * px} />
      <circle
        cx={0}
        cy={rotY}
        r={r * 1.25}
        fill={ACCENT}
        stroke="#ffffff"
        strokeWidth={1.6 * px}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          if (e.button === 0) onRotate(e);
        }}
      />
      <path
        d={`M ${-3 * px} ${rotY - 1.5 * px} a ${3 * px} ${3 * px} 0 1 1 ${3 * px} ${4.5 * px}`}
        fill="none"
        stroke="#fff"
        strokeWidth={1.3 * px}
        pointerEvents="none"
      />
      {handle(hw, 0, "x", 1)}
      {handle(-hw, 0, "x", -1)}
      {handle(0, hd, "z", 1)}
      {handle(0, -hd, "z", -1)}
    </g>
  );
}

function axisCursor(rotation: number, axis: "x" | "z") {
  const a = (rotation + (axis === "z" ? 90 : 0)) % 180;
  if (a < 22.5 || a >= 157.5) return "ew-resize";
  if (a < 67.5) return "nwse-resize";
  if (a < 112.5) return "ns-resize";
  return "nesw-resize";
}

async function exportSvgPng(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = svg.clientWidth;
  const h = svg.clientHeight;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not render plan"));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
