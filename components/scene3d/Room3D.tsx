"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { floorCanvas, FLOOR_TILE_CM } from "@/lib/textures";
import { alcoveRect, spaceRect, wallLength, type Rect } from "@/lib/geometry";
import type { Alcove, Opening, Room, Space, WallSide, WallVisibility } from "@/lib/types";
import { tone } from "./models";

const T = 0.12; // wall thickness, metres
const CUT = 0.1; // cutaway height, metres
const SIDES: WallSide[] = ["north", "east", "south", "west"];

export function Floor({
  room,
  onClick,
  onSpaceClick,
}: {
  room: Room;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onSpaceClick: (e: ThreeEvent<MouseEvent>, sp: Space) => void;
}) {
  const W = room.width / 100;
  const L = room.length / 100;
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(floorCanvas(room.floor));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [room.floor]);
  useEffect(() => () => texture.dispose(), [texture]);
  const tile = FLOOR_TILE_CM[room.floor] / 100;
  texture.repeat.set(W / tile, L / tile);
  // Align the texture origin with the plan's north-west corner, matching the 2D view.
  texture.offset.set(0, 0);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={onClick}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial map={texture} roughness={room.floor === "tile" || room.floor === "concrete" ? 0.45 : 0.75} />
      </mesh>
      {room.alcoves.map((a) => (
        <AlcoveFloor key={a.id} room={room} rect={alcoveRect(room, a)} texture={texture} tile={tile} onClick={onClick} />
      ))}
      {room.spaces.map((sp) => (
        <SpaceFloor key={sp.id} room={room} sp={sp} onClick={(e) => onSpaceClick(e, sp)} />
      ))}
      {/* Ground outside the room so walls don't float. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <planeGeometry args={[W + 40, L + 40]} />
        <meshStandardMaterial color="#e4e0d9" roughness={1} />
      </mesh>
    </group>
  );
}

/** Alcove floor with its own copy of the texture, offset so planks line up with the main floor. */
function AlcoveFloor({ room, rect, texture, tile, onClick }: { room: Room; rect: Rect; texture: THREE.Texture; tile: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const w = (rect.maxX - rect.minX) / 100;
  const d = (rect.maxZ - rect.minZ) / 100;
  const { minX, maxZ } = rect;
  const map = useMemo(() => {
    const m = texture.clone();
    // Main floor UVs run from the west edge (u) and the south edge (v).
    m.repeat.set(w / tile, d / tile);
    m.offset.set(minX / 100 / tile, (room.length - maxZ) / 100 / tile);
    m.needsUpdate = true;
    return m;
  }, [texture, w, d, tile, minX, maxZ, room.length]);
  useEffect(() => () => map.dispose(), [map]);
  const [x, , z] = planToWorld(room, rect, 0, 0);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, z]} receiveShadow onClick={onClick}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={room.floor === "tile" || room.floor === "concrete" ? 0.45 : 0.75} />
    </mesh>
  );
}

/** A space's own floor, laid just above the main floor so it shows through where the two overlap. */
function SpaceFloor({ room, sp, onClick }: { room: Room; sp: Space; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const w = sp.width / 100;
  const d = sp.length / 100;
  const tile = FLOOR_TILE_CM[sp.floor] / 100;
  const map = useMemo(() => {
    const t = new THREE.CanvasTexture(floorCanvas(sp.floor));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [sp.floor]);
  useEffect(() => () => map.dispose(), [map]);
  map.repeat.set(w / tile, d / tile);
  const [x, , z] = planToWorld(room, spaceRect(sp), 0, 0);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.002, z]} receiveShadow onClick={onClick}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={sp.floor === "tile" || sp.floor === "concrete" ? 0.45 : 0.75} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

/**
 * Partition walls round a space, with a gap and door leaf for its door. A
 * partition is cut down when the main wall on the same side is, so the
 * camera can still see in.
 */
function SpaceWalls({
  room,
  sp,
  hidden,
  color,
  cutColor,
  selected,
  onDown,
}: {
  room: Room;
  sp: Space;
  hidden: Set<WallSide>;
  color: string;
  cutColor: string;
  selected: boolean;
  onDown: (e: ThreeEvent<PointerEvent>, sp: Space) => void;
}) {
  const t = T * 100;
  const doorH = Math.min(205, room.height - 5);
  return (
    <group onPointerDown={(e) => onDown(e, sp)}>
      {SIDES.map((side) => {
        const isHidden = hidden.has(side);
        const maxY = isHidden ? CUT * 100 : room.height;
        const along = side === "north" || side === "south";
        const len = wallLength(sp, side);
        const door = sp.door?.wall === side ? sp.door : null;
        const gap = door ? [{ offset: door.offset, width: door.width, sill: 0, height: doorH } as Opening] : [];
        // Plan rectangle of a strip of this wall between u0 and u1 (cm along it from its start corner).
        const strip = (u0: number, u1: number): Rect => {
          if (side === "north") return { minX: sp.x + u0, maxX: sp.x + u1, minZ: sp.z - t, maxZ: sp.z };
          if (side === "south") return { minX: sp.x + u0, maxX: sp.x + u1, minZ: sp.z + sp.length, maxZ: sp.z + sp.length + t };
          if (side === "west") return { minX: sp.x - t, maxX: sp.x, minZ: sp.z + u0, maxZ: sp.z + u1 };
          return { minX: sp.x + sp.width, maxX: sp.x + sp.width + t, minZ: sp.z + u0, maxZ: sp.z + u1 };
        };
        const pieces = wallPieces(len, along ? t : 0, room.height, gap, maxY);
        const doorCentre = door ? planToWorld(room, strip(door.offset, door.offset), 0, 0) : null;
        return (
          <group key={side}>
            {pieces.map((p, i) => (
              <WallBox key={i} room={room} r={strip(p.u0, p.u1)} y0={p.y0} y1={p.y1} color={isHidden ? cutColor : color} shadow={!isHidden} />
            ))}
            {door && doorCentre && !isHidden && (
              <group position={[doorCentre[0], 0, doorCentre[2]]} rotation={[0, ROT_Y[side], 0]}>
                <Door
                  o={{ id: sp.id, kind: "door", wall: side, offset: 0, width: door.width, height: doorH, sill: 0, hinge: door.hinge, swing: door.swing }}
                  sx={side === "north" || side === "east" ? 1 : -1}
                  selected={selected}
                />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** World-space centre of a plan rectangle at a given vertical span (cm). */
function planToWorld(room: Room, r: Rect, y0: number, y1: number): [number, number, number] {
  return [((r.minX + r.maxX) / 2 - room.width / 2) / 100, (y0 + y1) / 200, ((r.minZ + r.maxZ) / 2 - room.length / 2) / 100];
}

function WallBox({ room, r, y0, y1, color, shadow }: { room: Room; r: Rect; y0: number; y1: number; color: string; shadow: boolean }) {
  return (
    <mesh position={planToWorld(room, r, y0, y1)} castShadow={shadow} receiveShadow>
      <boxGeometry args={[(r.maxX - r.minX) / 100, (y1 - y0) / 100, (r.maxZ - r.minZ) / 100]} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

const ROT_Y: Record<WallSide, number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

/** Side and back walls of an alcove, with a hole for its window. */
function AlcoveWalls({ room, a, hidden, color, cutColor }: { room: Room; a: Alcove; hidden: boolean; color: string; cutColor: string }) {
  const r = alcoveRect(room, a);
  const t = T * 100;
  const maxY = hidden ? CUT * 100 : room.height;
  const c = hidden ? cutColor : color;
  const horizontal = a.wall === "north" || a.wall === "south";
  const outward = a.wall === "south" || a.wall === "east";
  // Side walls run the alcove's depth; the back wall spans its width plus both side walls.
  const sides: Rect[] = horizontal
    ? [
        { minX: r.minX - t, maxX: r.minX, minZ: outward ? r.minZ : r.minZ - t, maxZ: outward ? r.maxZ + t : r.maxZ },
        { minX: r.maxX, maxX: r.maxX + t, minZ: outward ? r.minZ : r.minZ - t, maxZ: outward ? r.maxZ + t : r.maxZ },
      ]
    : [
        { minX: outward ? r.minX : r.minX - t, maxX: outward ? r.maxX + t : r.maxX, minZ: r.minZ - t, maxZ: r.minZ },
        { minX: outward ? r.minX : r.minX - t, maxX: outward ? r.maxX + t : r.maxX, minZ: r.maxZ, maxZ: r.maxZ + t },
      ];
  const win = a.window ? [{ offset: a.width / 2, width: a.window.width, sill: a.window.sill, height: a.window.height } as Opening] : [];
  const back = wallPieces(a.width, 0, room.height, win, maxY).map((p): Rect & { y0: number; y1: number } => {
    const strip = horizontal
      ? { minX: r.minX + p.u0, maxX: r.minX + p.u1, minZ: outward ? r.maxZ : r.minZ - t, maxZ: outward ? r.maxZ + t : r.minZ }
      : { minX: outward ? r.maxX : r.minX - t, maxX: outward ? r.maxX + t : r.minX, minZ: r.minZ + p.u0, maxZ: r.minZ + p.u1 };
    return { ...strip, y0: p.y0, y1: p.y1 };
  });
  const backCentre: Rect = horizontal
    ? { minX: r.minX, maxX: r.maxX, minZ: outward ? r.maxZ : r.minZ - t, maxZ: outward ? r.maxZ + t : r.minZ }
    : { minX: outward ? r.maxX : r.minX - t, maxX: outward ? r.maxX + t : r.minX, minZ: r.minZ, maxZ: r.maxZ };
  const [wx, , wz] = planToWorld(room, backCentre, 0, 0);
  return (
    <group>
      {sides.map((sr, i) => (
        <WallBox key={`s${i}`} room={room} r={sr} y0={0} y1={maxY} color={c} shadow={!hidden} />
      ))}
      {back.map((b, i) => (
        <WallBox key={`b${i}`} room={room} r={b} y0={b.y0} y1={b.y1} color={c} shadow={!hidden} />
      ))}
      {a.window && !hidden && (
        <group position={[wx, 0, wz]} rotation={[0, ROT_Y[a.wall], 0]}>
          <Window o={{ id: a.id, kind: "window", wall: a.wall, offset: 0, width: a.window.width, height: a.window.height, sill: a.window.sill, hinge: "start" }} selected={false} />
        </group>
      )}
    </group>
  );
}

/** Decide per frame which walls sit between the camera and the room. */
export function useHiddenWalls(room: Room, mode: WallVisibility) {
  const [hidden, setHidden] = useState<Set<WallSide>>(new Set());
  const key = useRef("");
  useFrame(({ camera }) => {
    let next: WallSide[] = [];
    if (mode === "cutaway") next = SIDES;
    else if (mode === "auto") {
      const W = room.width / 200;
      const L = room.length / 200;
      const p = camera.position;
      if (p.z < -L) next.push("north");
      if (p.z > L) next.push("south");
      if (p.x < -W) next.push("west");
      if (p.x > W) next.push("east");
      // Looking almost straight down: drop all walls for a clean plan-like view.
      if (p.y > Math.max(W, L) * 4 && next.length === 0) next = [];
    }
    const k = next.join(",");
    if (k !== key.current) {
      key.current = k;
      setHidden(new Set(next));
    }
  });
  return hidden;
}

interface Piece {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

function wallPieces(len: number, ext: number, height: number, openings: Opening[], maxY: number): Piece[] {
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const pieces: Piece[] = [];
  let u = -ext;
  for (const o of sorted) {
    const a = Math.max(u, o.offset - o.width / 2);
    const b = o.offset + o.width / 2;
    if (a > u) pieces.push({ u0: u, u1: a, y0: 0, y1: height });
    if (o.sill > 0) pieces.push({ u0: a, u1: b, y0: 0, y1: o.sill });
    if (o.sill + o.height < height) pieces.push({ u0: a, u1: b, y0: o.sill + o.height, y1: height });
    u = Math.max(u, b);
  }
  if (u < len + ext) pieces.push({ u0: u, u1: len + ext, y0: 0, y1: height });
  return pieces
    .map((p) => ({ ...p, y1: Math.min(p.y1, maxY) }))
    .filter((p) => p.y1 - p.y0 > 0.1 && p.u1 - p.u0 > 0.1);
}

export function Walls({
  room,
  openings,
  hidden,
  selectedOpening,
  selectedSpace,
  onOpeningDown,
  onSpaceDown,
}: {
  room: Room;
  openings: Opening[];
  hidden: Set<WallSide>;
  selectedOpening?: string;
  selectedSpace?: string;
  onOpeningDown: (e: ThreeEvent<PointerEvent>, o: Opening) => void;
  onSpaceDown: (e: ThreeEvent<PointerEvent>, sp: Space) => void;
}) {
  const W = room.width / 100;
  const L = room.length / 100;
  const color = room.wallColor;
  const cutColor = tone(color, -0.12);

  return (
    <group>
      {SIDES.map((side) => {
        const isHidden = hidden.has(side);
        const lenCm = wallLength(room, side);
        const ext = side === "north" || side === "south" ? T * 100 : 0;
        const ops = openings.filter((o) => o.wall === side);
        // Alcove mouths are full-height gaps in the host wall.
        const mouths = room.alcoves
          .filter((a) => a.wall === side)
          .map((a) => ({ offset: a.offset + a.width / 2, width: a.width, sill: 0, height: room.height }) as Opening);
        const pieces = wallPieces(lenCm, ext, room.height, [...ops, ...mouths], isHidden ? CUT * 100 : room.height);
        // Map wall-local (u along wall in cm, outward offset) to world.
        const toWorld = (u: number): [number, number] => {
          switch (side) {
            case "north":
              return [u / 100 - W / 2, -L / 2 - T / 2];
            case "south":
              return [u / 100 - W / 2, L / 2 + T / 2];
            case "west":
              return [-W / 2 - T / 2, u / 100 - L / 2];
            case "east":
              return [W / 2 + T / 2, u / 100 - L / 2];
          }
        };
        const along = side === "north" || side === "south";
        return (
          <group key={side}>
            {pieces.map((p, i) => {
              const [x, z] = toWorld((p.u0 + p.u1) / 2);
              const len = (p.u1 - p.u0) / 100;
              const h = (p.y1 - p.y0) / 100;
              return (
                <mesh key={i} position={[x, (p.y0 + p.y1) / 200, z]} castShadow={!isHidden} receiveShadow>
                  <boxGeometry args={along ? [len, h, T] : [T, h, len]} />
                  <meshStandardMaterial color={isHidden ? cutColor : color} roughness={0.92} />
                </mesh>
              );
            })}
            {!isHidden &&
              ops.map((o) => {
                const [x, z] = toWorld(o.offset);
                // Local +z points into the room; local +x runs along the wall for north/east
                // walls and against it for south/west.
                const rotY = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[side];
                const sx = side === "north" || side === "east" ? 1 : -1;
                return (
                  <group key={o.id} position={[x, 0, z]} rotation={[0, rotY, 0]} onPointerDown={(e) => onOpeningDown(e, o)}>
                    {o.kind === "window" ? <Window o={o} selected={selectedOpening === o.id} /> : <Door o={o} sx={sx} selected={selectedOpening === o.id} />}
                  </group>
                );
              })}
            {isHidden &&
              ops.map((o) => {
                // Floor marker so hidden doors and windows stay visible and selectable.
                const [x, z] = toWorld(o.offset);
                return (
                  <mesh key={o.id} position={[x, CUT + 0.002, z]} rotation={[-Math.PI / 2, 0, along ? 0 : Math.PI / 2]} onPointerDown={(e) => onOpeningDown(e, o)}>
                    <planeGeometry args={[o.width / 100, T]} />
                    <meshBasicMaterial color={selectedOpening === o.id ? "#2f6fed" : o.kind === "door" ? "#8f8a82" : "#9cc3e6"} />
                  </mesh>
                );
              })}
          </group>
        );
      })}
      {room.alcoves.map((a) => (
        <AlcoveWalls key={a.id} room={room} a={a} hidden={hidden.has(a.wall)} color={color} cutColor={cutColor} />
      ))}
      {room.spaces.map((sp) => (
        <SpaceWalls key={sp.id} room={room} sp={sp} hidden={hidden} color={color} cutColor={cutColor} selected={selectedSpace === sp.id} onDown={onSpaceDown} />
      ))}
    </group>
  );
}

const FRAME = "#f7f6f3";
const SEL = "#2f6fed";

function Window({ o, selected }: { o: Opening; selected: boolean }) {
  const w = o.width / 100;
  const h = o.height / 100;
  const y = o.sill / 100;
  const f = 0.05;
  const frame = selected ? SEL : FRAME;
  return (
    <group position={[0, y, 0]}>
      {/* Frame */}
      <mesh position={[0, f / 2, 0]}>
        <boxGeometry args={[w, f, T * 0.7]} />
        <meshStandardMaterial color={frame} roughness={0.5} />
      </mesh>
      <mesh position={[0, h - f / 2, 0]}>
        <boxGeometry args={[w, f, T * 0.7]} />
        <meshStandardMaterial color={frame} roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - f / 2), h / 2, 0]}>
          <boxGeometry args={[f, h, T * 0.7]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      ))}
      {w > 0.8 && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[f * 0.7, h, T * 0.5]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      )}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w - f, h - f, 0.01]} />
        <meshPhysicalMaterial color="#cfe3f3" transparent opacity={0.28} roughness={0.05} metalness={0} />
      </mesh>
      {/* Interior sill */}
      <mesh position={[0, -0.01, T / 2 + 0.03]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.08, 0.025, 0.08]} />
        <meshStandardMaterial color={FRAME} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Door({ o, sx, selected }: { o: Opening; sx: 1 | -1; selected: boolean }) {
  const w = o.width / 100;
  const h = o.height / 100;
  const f = 0.05;
  const frame = selected ? SEL : FRAME;
  const leafW = w - 0.02;
  // Hinge 'start' sits at the wall's start corner, matching the plan symbol.
  const hingeX = (o.hinge === "start" ? -w / 2 : w / 2) * sx;
  const sgn = hingeX > 0 ? 1 : -1;
  const open = 0.42; // radians ajar, swinging into the room (+z)
  // An outward door is the same leaf mirrored through the wall (three.js handles the flipped winding).
  const mirror = o.swing === "out" ? -1 : 1;
  return (
    <group>
      <mesh position={[0, h + f / 2, 0]}>
        <boxGeometry args={[w + 2 * f, f, T + 0.02]} />
        <meshStandardMaterial color={frame} roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 + f / 2), h / 2, 0]} castShadow>
          <boxGeometry args={[f, h, T + 0.02]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      ))}
      <group scale={[1, 1, mirror]}>
      <group position={[hingeX, 0, T / 2]} rotation={[0, sgn * open, 0]}>
        <mesh position={[-sgn * leafW / 2, h / 2, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[leafW, h - 0.01, 0.04]} />
          <meshStandardMaterial color="#f3f1ec" roughness={0.55} />
        </mesh>
        <mesh position={[-sgn * (leafW - 0.07), h * 0.48, 0.015]} castShadow>
          <boxGeometry args={[0.12, 0.018, 0.018]} />
          <meshStandardMaterial color="#8b8d90" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      </group>
    </group>
  );
}
