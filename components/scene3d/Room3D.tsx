"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { floorCanvas, FLOOR_TILE_CM } from "@/lib/textures";
import { wallLength } from "@/lib/geometry";
import type { Opening, Room, WallSide, WallVisibility } from "@/lib/types";
import { tone } from "./models";

const T = 0.12; // wall thickness, metres
const CUT = 0.1; // cutaway height, metres
const SIDES: WallSide[] = ["north", "east", "south", "west"];

export function Floor({ room, onClick }: { room: Room; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
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
      {/* Ground outside the room so walls don't float. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <planeGeometry args={[W + 40, L + 40]} />
        <meshStandardMaterial color="#e4e0d9" roughness={1} />
      </mesh>
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
  onOpeningDown,
}: {
  room: Room;
  openings: Opening[];
  hidden: Set<WallSide>;
  selectedOpening?: string;
  onOpeningDown: (e: ThreeEvent<PointerEvent>, o: Opening) => void;
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
        const pieces = wallPieces(lenCm, ext, room.height, ops, isHidden ? CUT * 100 : room.height);
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
  );
}
