"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import type { FurnitureType } from "@/lib/types";

/** Sizes are metres. Models sit on y = 0, centred on their footprint, front facing +z. */
export interface ModelProps {
  w: number;
  d: number;
  h: number;
  color: string;
}

export function tone(hex: string, lightness: number, saturation = 0) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, saturation, lightness);
  return `#${c.getHexString()}`;
}

const METAL = "#8b8d90";

/** Small deterministic PRNG so procedural details stay stable between renders. */
function makeRng(seed: number) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
const DARK_METAL = "#2d2e30";
const LINEN = "#f4f1eb";

function Box({
  size,
  position,
  color,
  rough = 0.75,
  metal = 0,
  rotation,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  rough?: number;
  metal?: number;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
    </mesh>
  );
}

function Soft({
  size,
  position,
  color,
  radius,
  rough = 0.95,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  radius: number;
  rough?: number;
}) {
  const r = Math.min(radius, size[0] / 2 - 0.001, size[1] / 2 - 0.001, size[2] / 2 - 0.001);
  return (
    <RoundedBox args={size} radius={Math.max(0.001, r)} smoothness={3} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={rough} />
    </RoundedBox>
  );
}

function Legs({ w, d, h, inset = 0.04, size = 0.035, color, round = false }: { w: number; d: number; h: number; inset?: number; size?: number; color: string; round?: boolean }) {
  const xs = [-w / 2 + inset, w / 2 - inset];
  const zs = [-d / 2 + inset, d / 2 - inset];
  return (
    <>
      {xs.flatMap((x) =>
        zs.map((z) =>
          round ? (
            <mesh key={`${x}${z}`} position={[x, h / 2, z]} castShadow>
              <cylinderGeometry args={[size / 2, size / 2.6, h, 12]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
          ) : (
            <Box key={`${x}${z}`} size={[size, h, size]} position={[x, h / 2, z]} color={color} rough={0.6} />
          ),
        ),
      )}
    </>
  );
}

function Bed({ w, d, h, color }: ModelProps) {
  const legH = 0.08;
  const baseH = 0.24;
  const matH = 0.2;
  const baseTop = legH + baseH;
  const headT = 0.08;
  const pillows = w > 1.3 ? 2 : 1;
  const pw = Math.min(0.62, (w - 0.2) / pillows - 0.04);
  const duvet = tone(color, 0.18, -0.05);
  return (
    <group>
      <Legs w={w - 0.04} d={d - 0.04} h={legH} color={tone(color, -0.25)} size={0.05} />
      <Soft size={[w, baseH, d - headT]} position={[0, legH + baseH / 2, headT / 2]} color={color} radius={0.03} />
      <Soft size={[w, Math.max(h - legH, 0.3), headT]} position={[0, legH + Math.max(h - legH, 0.3) / 2, -d / 2 + headT / 2]} color={color} radius={0.035} />
      <Soft size={[w - 0.06, matH, d - headT - 0.04]} position={[0, baseTop + matH / 2 - 0.02, headT / 2]} color={LINEN} radius={0.05} />
      {/* Duvet over the lower two thirds, draping slightly over the sides. */}
      <Soft size={[w - 0.02, 0.07, (d - headT) * 0.68]} position={[0, baseTop + matH - 0.005, d / 2 - ((d - headT) * 0.68) / 2 - 0.01]} color={duvet} radius={0.03} />
      <Soft size={[w - 0.01, 0.075, 0.28]} position={[0, baseTop + matH + 0.003, d / 2 - 0.22]} color={tone(color, -0.08)} radius={0.03} />
      {Array.from({ length: pillows }, (_, i) => {
        const x = pillows === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.03);
        return <Soft key={i} size={[pw, 0.13, 0.36]} position={[x, baseTop + matH + 0.04, -d / 2 + headT + 0.24]} color="#ffffff" radius={0.06} />;
      })}
    </group>
  );
}

function Wardrobe({ w, d, h, color }: ModelProps) {
  const doors = Math.max(1, Math.round(w / 0.5));
  const plinth = 0.08;
  const dw = w / doors;
  return (
    <group>
      <Box size={[w - 0.04, plinth, d - 0.04]} position={[0, plinth / 2, -0.01]} color={tone(color, -0.2)} />
      <Box size={[w, h - plinth, d - 0.02]} position={[0, plinth + (h - plinth) / 2, -0.01]} color={color} rough={0.7} />
      {Array.from({ length: doors }, (_, i) => {
        const x = -w / 2 + dw * (i + 0.5);
        // Handles sit on the edge where door pairs meet.
        const handleSide = doors === 1 ? 1 : i % 2 === 0 ? 1 : -1;
        return (
          <group key={i}>
            <Box size={[dw - 0.006, h - plinth - 0.01, 0.018]} position={[x, plinth + (h - plinth) / 2, d / 2 - 0.01]} color={tone(color, 0.02)} rough={0.6} />
            <Box size={[0.012, 0.32, 0.02]} position={[x + handleSide * (dw / 2 - 0.05), plinth + (h - plinth) * 0.52, d / 2 + 0.012]} color={METAL} rough={0.3} metal={0.8} />
          </group>
        );
      })}
    </group>
  );
}

function Desk({ w, d, h, color }: ModelProps) {
  const top = 0.03;
  const leg = tone(color, -0.35);
  return (
    <group>
      <Box size={[w, top, d]} position={[0, h - top / 2, 0]} color={color} rough={0.55} />
      <Legs w={w} d={d} h={h - top} inset={0.05} size={0.04} color={leg} />
      <Box size={[w - 0.12, 0.08, 0.018]} position={[0, h - top - 0.04, -d / 2 + 0.06]} color={leg} />
      {/* Laptop and notebook make the desk instantly readable. */}
      {w > 0.6 && (
        <group position={[-w * 0.12, h, -0.02]}>
          <Box size={[0.33, 0.012, 0.23]} position={[0, 0.006, 0]} color="#b9bbbe" rough={0.35} metal={0.6} />
          <Box size={[0.33, 0.22, 0.008]} position={[0, 0.11, -0.115]} rotation={[-0.25, 0, 0]} color="#b9bbbe" rough={0.35} metal={0.6} />
          <mesh position={[0, 0.112, -0.109]} rotation={[-0.25, 0, 0]}>
            <planeGeometry args={[0.3, 0.19]} />
            <meshStandardMaterial color="#1f2a36" emissive="#30455c" emissiveIntensity={0.4} roughness={0.2} />
          </mesh>
        </group>
      )}
      {w > 0.8 && <Box size={[0.15, 0.015, 0.21]} position={[w * 0.28, h + 0.0075, 0.04]} rotation={[0, 0.25, 0]} color="#e9e2d0" />}
    </group>
  );
}

function Chair({ w, d, h, color }: ModelProps) {
  const seatY = Math.min(0.46, h * 0.56);
  const seatT = 0.045;
  const leg = tone(color, -0.15);
  return (
    <group>
      <Legs w={w - 0.02} d={d - 0.02} h={seatY - seatT} size={0.035} color={leg} round />
      <Soft size={[w, seatT, d * 0.92]} position={[0, seatY - seatT / 2, d * 0.04]} color={color} radius={0.015} rough={0.6} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.032, h - seatY + 0.02, 0.032]} position={[s * (w / 2 - 0.03), seatY + (h - seatY) / 2, -d / 2 + 0.03]} color={leg} rough={0.6} />
      ))}
      <Soft size={[w - 0.02, Math.min(0.2, (h - seatY) * 0.55), 0.025]} position={[0, h - Math.min(0.2, (h - seatY) * 0.55) / 2 - 0.02, -d / 2 + 0.03]} color={color} radius={0.01} rough={0.6} />
    </group>
  );
}

function Armchair({ w, d, h, color }: ModelProps) {
  const legH = 0.12;
  const arm = Math.min(0.16, w * 0.2);
  const seatTop = 0.44;
  return (
    <group>
      <Legs w={w - 0.08} d={d - 0.08} h={legH} size={0.035} color="#6b4a33" round />
      <Soft size={[w, seatTop - legH - 0.1, d]} position={[0, legH + (seatTop - legH - 0.1) / 2, 0]} color={color} radius={0.05} />
      <Soft size={[w - 2 * arm, 0.13, d - 0.2]} position={[0, seatTop - 0.065, 0.08]} color={tone(color, 0.04)} radius={0.05} />
      <Soft size={[w, h - legH, 0.18]} position={[0, legH + (h - legH) / 2, -d / 2 + 0.09]} color={color} radius={0.07} />
      {[-1, 1].map((s) => (
        <Soft key={s} size={[arm, 0.62 - legH, d]} position={[s * (w / 2 - arm / 2), legH + (0.62 - legH) / 2, 0]} color={color} radius={0.06} />
      ))}
    </group>
  );
}

function Drawers({ w, d, h, color, rows, cols, legH }: ModelProps & { rows: number; cols: number; legH: number }) {
  const bodyH = h - legH;
  const gap = 0.006;
  const fw = (w - 0.04) / cols;
  const fh = (bodyH - 0.04) / rows;
  const front = tone(color, 0.03);
  return (
    <group>
      <Legs w={w - 0.02} d={d - 0.02} h={legH} size={0.03} color={tone(color, -0.3)} round />
      <Box size={[w, bodyH, d - 0.02]} position={[0, legH + bodyH / 2, -0.01]} color={color} rough={0.65} />
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = -w / 2 + 0.02 + fw * (c + 0.5);
        const y = legH + 0.02 + fh * (r + 0.5);
        return (
          <group key={i}>
            <Box size={[fw - gap, fh - gap, 0.016]} position={[x, y, d / 2 - 0.01]} color={front} rough={0.55} />
            <Box size={[Math.min(0.12, fw * 0.35), 0.012, 0.018]} position={[x, y + fh * 0.18, d / 2 + 0.008]} color={METAL} rough={0.3} metal={0.8} />
          </group>
        );
      })}
    </group>
  );
}

function Bookcase({ w, d, h, color }: ModelProps) {
  const t = 0.02;
  const cols = Math.max(1, Math.round(w / 0.4));
  const shelves = Math.max(2, Math.round(h / 0.36));
  const sh = (h - t) / shelves;
  const books = useMemo(() => {
    // Deterministic pseudo-random spines.
    const palette = ["#7c3f33", "#2f4858", "#c9a66b", "#506b52", "#d9d4cb", "#3d3a4b", "#a8573f", "#e5c07b"];
    const out: { x: number; y: number; bw: number; bh: number; color: string }[] = [];
    const rnd = makeRng(Math.round(w * 1000 + h * 100));
    const cw = (w - t) / cols;
    for (let s = 0; s < shelves; s++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.22) continue;
        let x = -w / 2 + t + c * cw + 0.01;
        const end = x + cw * (0.5 + rnd() * 0.4);
        while (x < end) {
          const bw = 0.02 + rnd() * 0.025;
          const bh = sh * (0.6 + rnd() * 0.3);
          out.push({ x: x + bw / 2, y: t + s * sh + bh / 2, bw, bh, color: palette[Math.floor(rnd() * palette.length)] });
          x += bw + 0.002;
        }
      }
    }
    return out;
  }, [w, h, cols, shelves, sh]);
  return (
    <group>
      <Box size={[w, h, 0.01]} position={[0, h / 2, -d / 2 + 0.005]} color={tone(color, -0.06)} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[t, h, d]} position={[s * (w / 2 - t / 2), h / 2, 0]} color={color} />
      ))}
      {Array.from({ length: cols - 1 }, (_, i) => (
        <Box key={`c${i}`} size={[t, h - t, d - 0.01]} position={[-w / 2 + ((i + 1) * w) / cols, h / 2, 0.005]} color={color} />
      ))}
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Box key={`s${i}`} size={[w - 2 * t, t, d - 0.01]} position={[0, i * sh + t / 2, 0.005]} color={color} />
      ))}
      {books.map((b, i) => (
        <Box key={`b${i}`} size={[b.bw, b.bh, d * 0.75]} position={[b.x, b.y, 0]} color={b.color} rough={0.8} />
      ))}
    </group>
  );
}

function Rug({ w, d, color, round }: ModelProps & { round?: boolean }) {
  if (round) {
    return (
      <group scale={[w, 1, d]}>
        <mesh position={[0, 0.005, 0]} receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.01, 64]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[0.36, 0.39, 64]} />
          <meshStandardMaterial color={tone(color, 0.12)} roughness={1} />
        </mesh>
      </group>
    );
  }
  const b = Math.min(0.12, Math.min(w, d) * 0.08);
  return (
    <group>
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[w, 0.01, d]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[frameShape(w - b * 2, d - b * 2, 0.025)]} />
        <meshStandardMaterial color={tone(color, 0.12)} roughness={1} />
      </mesh>
    </group>
  );
}

function frameShape(w: number, d: number, t: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2);
  s.lineTo(w / 2, -d / 2);
  s.lineTo(w / 2, d / 2);
  s.lineTo(-w / 2, d / 2);
  s.lineTo(-w / 2, -d / 2);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2 + t, -d / 2 + t);
  hole.lineTo(-w / 2 + t, d / 2 - t);
  hole.lineTo(w / 2 - t, d / 2 - t);
  hole.lineTo(w / 2 - t, -d / 2 + t);
  hole.lineTo(-w / 2 + t, -d / 2 + t);
  s.holes.push(hole);
  return s;
}

function Shade({ r, h, y, color }: { r: number; h: number; y: number; color: string }) {
  return (
    <mesh position={[0, y, 0]} castShadow>
      <cylinderGeometry args={[r * 0.78, r, h, 32, 1, true]} />
      <meshStandardMaterial color={color} emissive="#ffd9a0" emissiveIntensity={0.55} side={THREE.DoubleSide} roughness={0.9} transparent opacity={0.96} />
    </mesh>
  );
}

function FloorLamp({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, d) / 2;
  const shadeH = Math.min(0.3, h * 0.2);
  return (
    <group>
      <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r * 0.7, r * 0.75, 0.024, 32]} />
        <meshStandardMaterial color={DARK_METAL} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, (h - shadeH * 0.5) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.011, 0.011, h - shadeH * 0.5, 12]} />
        <meshStandardMaterial color={DARK_METAL} roughness={0.4} metalness={0.6} />
      </mesh>
      <Shade r={r} h={shadeH} y={h - shadeH / 2} color={color} />
      <pointLight position={[0, h - shadeH * 0.6, 0]} intensity={0.6} distance={3.5} decay={2} color="#ffd8a8" />
    </group>
  );
}

function TableLamp({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, d) / 2;
  const shadeH = h * 0.42;
  return (
    <group>
      <mesh position={[0, h * 0.25, 0]} castShadow>
        <sphereGeometry args={[r * 0.55, 24, 16]} />
        <meshStandardMaterial color={tone(color, -0.15)} roughness={0.35} />
      </mesh>
      <mesh position={[0, h * 0.04, 0]} castShadow>
        <cylinderGeometry args={[r * 0.35, r * 0.4, h * 0.08, 20]} />
        <meshStandardMaterial color={tone(color, -0.15)} roughness={0.35} />
      </mesh>
      <mesh position={[0, h * 0.5, 0]}>
        <cylinderGeometry args={[0.006, 0.006, h * 0.3, 8]} />
        <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
      </mesh>
      <Shade r={r} h={shadeH} y={h - shadeH / 2} color={color} />
      <pointLight position={[0, h - shadeH * 0.6, 0]} intensity={0.25} distance={2} decay={2} color="#ffd8a8" />
    </group>
  );
}

function Plant({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, d) / 2;
  const potH = Math.min(0.32, h * 0.3);
  const leaves = useMemo(() => {
    const out: { p: [number, number, number]; s: number; c: string }[] = [];
    const greens = ["#4f7a45", "#5f8f4f", "#3f6b3c", "#6e9a5a"];
    const rnd = makeRng(7);
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * 0.8;
      const y = potH + (h - potH) * (0.35 + rnd() * 0.55);
      out.push({ p: [Math.cos(a) * rr, y, Math.sin(a) * rr], s: 0.35 + rnd() * 0.3, c: greens[i % greens.length] });
    }
    return out;
  }, [h, potH]);
  return (
    <group>
      <mesh position={[0, potH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r * 0.7, r * 0.55, potH, 28]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, potH - 0.01, 0]}>
        <cylinderGeometry args={[r * 0.66, r * 0.66, 0.01, 24]} />
        <meshStandardMaterial color="#4a3a2c" roughness={1} />
      </mesh>
      <mesh position={[0, potH + (h - potH) * 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.018, (h - potH) * 0.6, 8]} />
        <meshStandardMaterial color="#6b4f37" roughness={0.9} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={[l.p[0] * r, l.p[1], l.p[2] * r]} scale={[r * l.s, r * l.s * 0.8, r * l.s]} castShadow>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={l.c} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Tv({ w, d, h, color }: ModelProps) {
  const panelT = 0.035;
  const baseH = 0.02;
  const neckH = Math.min(0.08, h * 0.1);
  const screenH = h - baseH - neckH;
  const z = -d / 2 + panelT / 2 + 0.01;
  return (
    <group>
      {/* Pedestal base and neck */}
      <Box size={[w * 0.32, baseH, d * 0.85]} position={[0, baseH / 2, 0]} color={tone(color, 0.05)} rough={0.35} metal={0.5} />
      <Box size={[0.06, neckH, 0.03]} position={[0, baseH + neckH / 2, z]} color={tone(color, 0.05)} rough={0.35} metal={0.5} />
      <Box size={[w, screenH, panelT]} position={[0, baseH + neckH + screenH / 2, z]} color={color} rough={0.4} metal={0.3} />
      {/* Screen glass on the front face */}
      <mesh position={[0, baseH + neckH + screenH / 2, z + panelT / 2 + 0.001]}>
        <planeGeometry args={[w - 0.02, screenH - 0.02]} />
        <meshStandardMaterial color="#0d1117" emissive="#1c2a3d" emissiveIntensity={0.35} roughness={0.08} metalness={0.2} />
      </mesh>
    </group>
  );
}

function TvStand({ w, d, h, color }: ModelProps) {
  const legH = Math.min(0.1, h * 0.2);
  const bodyH = h - legH;
  const third = w / 3;
  const t = 0.018;
  const front = tone(color, 0.03);
  return (
    <group>
      <Legs w={w - 0.04} d={d - 0.04} h={legH} size={0.03} color={tone(color, -0.3)} round />
      {/* Carcass: top, bottom, back, sides, dividers */}
      <Box size={[w, t, d]} position={[0, h - t / 2, 0]} color={color} rough={0.6} />
      <Box size={[w, t, d]} position={[0, legH + t / 2, 0]} color={color} rough={0.6} />
      <Box size={[w, bodyH, 0.01]} position={[0, legH + bodyH / 2, -d / 2 + 0.005]} color={tone(color, -0.08)} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[t, bodyH, d]} position={[s * (w / 2 - t / 2), legH + bodyH / 2, 0]} color={color} rough={0.6} />
      ))}
      {[-1, 1].map((s) => (
        <Box key={`v${s}`} size={[t, bodyH - 2 * t, d - 0.01]} position={[s * (third / 2), legH + bodyH / 2, 0.005]} color={color} rough={0.6} />
      ))}
      {/* Doors on the outer bays, open shelf in the middle */}
      {[-1, 1].map((s) => (
        <group key={`d${s}`}>
          <Box size={[third - 0.01, bodyH - 0.01, 0.016]} position={[s * third, legH + bodyH / 2, d / 2 - 0.008]} color={front} rough={0.55} />
          <Box size={[0.1, 0.012, 0.018]} position={[s * third, legH + bodyH * 0.78, d / 2 + 0.01]} color={METAL} rough={0.3} metal={0.8} />
        </group>
      ))}
      <Box size={[third - 0.04, t, d - 0.04]} position={[0, legH + bodyH / 2, 0]} color={color} rough={0.6} />
      <Box size={[0.3, 0.05, 0.2]} position={[0, legH + t + 0.025, 0]} color="#2b2b2b" rough={0.4} />
    </group>
  );
}

export function FurnitureModel({ type, ...p }: ModelProps & { type: FurnitureType }) {
  switch (type) {
    case "bed":
      return <Bed {...p} />;
    case "wardrobe":
      return <Wardrobe {...p} />;
    case "desk":
      return <Desk {...p} />;
    case "chair":
      return <Chair {...p} />;
    case "armchair":
      return <Armchair {...p} />;
    case "nightstand":
      return <Drawers {...p} rows={2} cols={1} legH={Math.min(0.12, p.h * 0.2)} />;
    case "dresser":
      return <Drawers {...p} rows={3} cols={p.w > 1 ? 2 : 1} legH={Math.min(0.1, p.h * 0.14)} />;
    case "bookcase":
      return <Bookcase {...p} />;
    case "rug":
      return <Rug {...p} />;
    case "rug-round":
      return <Rug {...p} round />;
    case "floor-lamp":
      return <FloorLamp {...p} />;
    case "table-lamp":
      return <TableLamp {...p} />;
    case "plant":
      return <Plant {...p} />;
    case "tv":
      return <Tv {...p} />;
    case "tv-stand":
      return <TvStand {...p} />;
  }
}
