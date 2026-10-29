"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanner, normalizeAngle } from "@/lib/store";
import { viewBridge } from "@/lib/bridge";
import {
  aabb,
  clampOpeningOffset,
  halfExtents,
  surfaceElevations,
  nearestWall,
  round1,
  snapPosition,
  wallFrame,
  wallLength,
  type Vec2,
} from "@/lib/geometry";
import { floorDataUrl, FLOOR_TILE_CM } from "@/lib/textures";
import { formatLength } from "@/lib/units";
import { isFloorCovering } from "@/lib/catalog";
import type { FurnitureItem, Opening, Room, Unit } from "@/lib/types";
import { PlanSymbol } from "./PlanSymbol";
import { useWarnings } from "../planner/useWarnings";

const WALL = 12;
const ACCENT = "#2f6fed";
const WARN = "#dc4a3d";
const FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

type Camera = { s: number; tx: number; ty: number };

type Gesture =
  | { kind: "pan"; startX: number; startY: number; cam: Camera; moved: boolean }
  | { kind: "move"; id: string; offset: Vec2 }
  | { kind: "resize"; id: string; axis: "x" | "z"; sign: 1 | -1 }
  | { kind: "rotate"; id: string }
  | { kind: "opening"; id: string; grab: number };

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
  const gesture = useRef<Gesture | null>(null);
  const camRef = useRef<Camera | null>(null);

  const fit = useCallback(
    (w = size.w, h = size.h): Camera => {
      const margin = 90;
      const s = Math.min(w / (room.width + margin * 2), h / (room.length + margin * 2));
      return { s, tx: (w - room.width * s) / 2, ty: (h - room.length * s) / 2 };
    },
    [room.width, room.length, size.w, size.h],
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
  const layoutKey = `${size.w}x${size.h}:${room.width}x${room.length}`;
  const cam = userCam?.key === layoutKey ? userCam.cam : fit();
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

  const px = 1 / cam.s;
  // Draw rugs first, then by top height, so a lamp on a nightstand stays visible.
  const sorted = useMemo(() => {
    const elev = surfaceElevations(furniture);
    const top = (f: FurnitureItem) => (elev.get(f.id) ?? 0) * 10 + f.height;
    return [...furniture].sort((a, b) => Number(isFloorCovering(b.type)) - Number(isFloorCovering(a.type)) || top(a) - top(b));
  }, [furniture]);
  const selectedItem = selection?.kind === "furniture" ? furniture.find((f) => f.id === selection.id) : undefined;
  const selectedOpening = selection?.kind === "opening" ? openings.find((o) => o.id === selection.id) : undefined;
  const tile = FLOOR_TILE_CM[room.floor];

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
              <pattern id="grid" patternUnits="userSpaceOnUse" width={50} height={50}>
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#000" strokeOpacity={0.08} strokeWidth={px} />
              </pattern>
            </defs>

            <rect x={0} y={0} width={room.width} height={room.length} fill="url(#floor)" />
            <rect x={0} y={0} width={room.width} height={room.length} fill="#ffffff" fillOpacity={0.35} />
            <rect x={0} y={0} width={room.width} height={room.length} fill="url(#grid)" />

            <Walls room={room} />

            {openings.map((o) => (
              <OpeningSymbol
                key={o.id}
                room={room}
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

            {showDims && <RoomDimensions room={room} unit={unit} px={px} />}
            {selectedItem && showDims && <ItemDimensions it={selectedItem} room={room} unit={unit} px={px} />}
            {selectedOpening && showDims && <OpeningDimensions o={selectedOpening} room={room} unit={unit} px={px} />}

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
    </div>
  );
}

function Walls({ room }: { room: Room }) {
  const t = WALL;
  return (
    <g fill="#3b3733" pointerEvents="none">
      <rect x={-t} y={-t} width={room.width + 2 * t} height={t} />
      <rect x={-t} y={room.length} width={room.width + 2 * t} height={t} />
      <rect x={-t} y={0} width={t} height={room.length} />
      <rect x={room.width} y={0} width={t} height={room.length} />
    </g>
  );
}

function OpeningSymbol({
  room,
  o,
  px,
  selected,
  onPointerDown,
}: {
  room: Room;
  o: Opening;
  px: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const f = wallFrame(room, o.wall);
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
      <rect x={a} y={-WALL - 6} width={o.width} height={WALL + 12 + (o.kind === "door" ? o.width : 0)} fill="transparent" />
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
          return (
            <>
              <line x1={hingeU} y1={0} x2={hingeU} y2={o.width} stroke={stroke} strokeWidth={2.4 * px} />
              <path
                d={`M ${freeU} 0 A ${o.width} ${o.width} 0 0 ${sweep} ${hingeU} ${o.width}`}
                fill={selected ? ACCENT : "#3b3733"}
                fillOpacity={0.04}
                stroke={stroke}
                strokeWidth={1 * px}
                strokeDasharray={`${4 * px} ${3 * px}`}
              />
            </>
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
