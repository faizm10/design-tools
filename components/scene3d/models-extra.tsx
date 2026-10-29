"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { FurnitureType } from "@/lib/types";
import { Box, Legs, makeRng, Soft, tone, type ModelProps } from "./models";

/** Glowing material for LED pieces; skips tone mapping so the colour stays saturated. */
function Glow({ color, intensity = 2.2 }: { color: string; intensity?: number }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />;
}

function Sofa({ w, d, h, color }: ModelProps) {
  const legH = 0.1;
  const arm = Math.min(0.16, w * 0.12);
  const seatTop = 0.44;
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.62));
  const cw = (w - 2 * arm) / seats;
  return (
    <group>
      <Legs w={w - 0.08} d={d - 0.08} h={legH} size={0.035} color="#4a3426" round />
      <Soft size={[w, seatTop - legH - 0.12, d]} position={[0, legH + (seatTop - legH - 0.12) / 2, 0]} color={color} radius={0.04} />
      {Array.from({ length: seats }, (_, i) => (
        <Soft key={i} size={[cw - 0.01, 0.14, d - 0.22]} position={[-w / 2 + arm + cw * (i + 0.5), seatTop - 0.07, 0.08]} color={tone(color, 0.04)} radius={0.05} />
      ))}
      <Soft size={[w, h - legH, 0.2]} position={[0, legH + (h - legH) / 2, -d / 2 + 0.1]} color={color} radius={0.07} />
      {Array.from({ length: seats }, (_, i) => (
        <Soft key={`b${i}`} size={[cw - 0.03, (h - seatTop) * 0.8, 0.12]} position={[-w / 2 + arm + cw * (i + 0.5), seatTop + (h - seatTop) * 0.4, -d / 2 + 0.24]} color={tone(color, 0.06)} radius={0.05} />
      ))}
      {[-1, 1].map((s) => (
        <Soft key={s} size={[arm, 0.6 - legH, d]} position={[s * (w / 2 - arm / 2), legH + (0.6 - legH) / 2, 0]} color={color} radius={0.06} />
      ))}
    </group>
  );
}

function Bench({ w, d, h, color }: ModelProps) {
  const top = Math.min(0.14, h * 0.35);
  return (
    <group>
      <Legs w={w - 0.04} d={d - 0.04} h={h - top} size={0.035} color="#4a3426" round />
      <Soft size={[w, top, d]} position={[0, h - top / 2, 0]} color={color} radius={0.04} />
    </group>
  );
}

function Pouf({ w, d, h, color }: ModelProps) {
  return (
    <group scale={[w, 1, d]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.48, h, 40]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, h + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.2, 40]} />
        <meshStandardMaterial color={tone(color, -0.1)} roughness={1} />
      </mesh>
    </group>
  );
}

function SideTable({ w, d, h, color }: ModelProps) {
  return (
    <group scale={[w, 1, d]}>
      <mesh position={[0, h - 0.0125, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.025, 40]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, (h - 0.025) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, h - 0.025, 16]} />
        <meshStandardMaterial color={tone(color, -0.1)} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.01, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.32, 0.02, 32]} />
        <meshStandardMaterial color={tone(color, -0.1)} roughness={0.5} />
      </mesh>
    </group>
  );
}

const MIRROR = { color: "#c7d3dc", metalness: 0.9, roughness: 0.06 };

function FloorMirror({ w, d, h, color }: ModelProps) {
  const f = 0.03;
  // Leans back against the wall behind it.
  return (
    <group position={[0, 0, d / 2 - 0.02]} rotation={[-0.08, 0, 0]}>
      <Box size={[w, h, 0.025]} position={[0, h / 2, 0]} color={color} rough={0.5} />
      <mesh position={[0, h / 2, 0.0135]}>
        <planeGeometry args={[w - 2 * f, h - 2 * f]} />
        <meshStandardMaterial {...MIRROR} />
      </mesh>
    </group>
  );
}

function WallMirror({ w, h, color }: ModelProps) {
  const r = Math.min(w, h) / 2;
  return (
    <group position={[0, h / 2, 0]}>
      <mesh castShadow>
        <torusGeometry args={[r - 0.015, 0.015, 12, 48]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.005]}>
        <circleGeometry args={[r - 0.02, 48]} />
        <meshStandardMaterial {...MIRROR} />
      </mesh>
    </group>
  );
}

function WallShelf({ w, d, h, color }: ModelProps) {
  const books = useMemo(() => {
    const rnd = makeRng(Math.round(w * 1000));
    const palette = ["#7c3f33", "#2f4858", "#c9a66b", "#506b52", "#e9e2d0"];
    const out: { x: number; bw: number; bh: number; c: string }[] = [];
    let x = -w / 2 + 0.04;
    const end = -w / 2 + w * 0.45;
    while (x < end) {
      const bw = 0.02 + rnd() * 0.02;
      out.push({ x: x + bw / 2, bw, bh: 0.15 + rnd() * 0.08, c: palette[Math.floor(rnd() * palette.length)] });
      x += bw + 0.002;
    }
    return out;
  }, [w]);
  return (
    <group>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} color={color} rough={0.55} />
      {books.map((b, i) => (
        <Box key={i} size={[b.bw, b.bh, d * 0.7]} position={[b.x, h + b.bh / 2, -0.01]} color={b.c} />
      ))}
      {w > 0.5 && (
        <group position={[w * 0.28, h, 0]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.035, 0.1, 16]} />
            <meshStandardMaterial color="#e9e4da" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.14, 0]} castShadow>
            <icosahedronGeometry args={[0.07, 0]} />
            <meshStandardMaterial color="#5f8f4f" roughness={0.85} flatShading />
          </mesh>
        </group>
      )}
    </group>
  );
}

function WallPanel({ w, d, h, color }: ModelProps) {
  const slat = 0.028;
  const gap = 0.014;
  const count = Math.max(2, Math.floor(w / (slat + gap)));
  const step = w / count;
  return (
    <group>
      {/* Dark felt backing with wooden slats on top, like acoustic slat panels. */}
      <Box size={[w, h, d * 0.35]} position={[0, h / 2, -d / 2 + (d * 0.35) / 2]} color="#2a2826" rough={1} />
      {Array.from({ length: count }, (_, i) => (
        <Box key={i} size={[slat, h, d * 0.65]} position={[-w / 2 + step * (i + 0.5), h / 2, d / 2 - (d * 0.65) / 2]} color={i % 3 === 0 ? tone(color, 0.02) : color} rough={0.6} />
      ))}
    </group>
  );
}

function WallArt({ w, d, h, color }: ModelProps) {
  const f = 0.025;
  return (
    <group position={[0, h / 2, 0]}>
      <Box size={[w, h, d]} position={[0, 0, 0]} color="#1f1f1f" rough={0.5} />
      <mesh position={[0, 0, d / 2 + 0.001]}>
        <planeGeometry args={[w - 2 * f, h - 2 * f]} />
        <meshStandardMaterial color="#f3efe6" roughness={0.9} />
      </mesh>
      {/* Simple abstract composition in the chosen accent colour. */}
      <mesh position={[-w * 0.12, h * 0.05, d / 2 + 0.002]}>
        <circleGeometry args={[Math.min(w, h) * 0.22, 40]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[w * 0.16, -h * 0.12, d / 2 + 0.003]}>
        <planeGeometry args={[w * 0.32, h * 0.36]} />
        <meshStandardMaterial color={tone(color, -0.2)} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Clock({ w, h, color }: ModelProps) {
  const r = Math.min(w, h) / 2;
  return (
    <group position={[0, h / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, 0.03, 40]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.016, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.88, 40]} />
        <meshStandardMaterial color="#f7f5f0" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, -0.02, 0]}>
        <Box size={[0.008, 0.002, r * 0.55]} position={[0, 0, r * 0.25]} color="#1f1f1f" />
        <Box size={[r * 0.7, 0.002, 0.006]} position={[r * 0.33, 0, 0]} color="#1f1f1f" />
      </group>
    </group>
  );
}

function Curtain({ w, d, h, color }: ModelProps) {
  const folds = Math.max(4, Math.round(w / 0.07));
  const step = w / folds;
  return (
    <group>
      <mesh position={[0, h - 0.01, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, w + 0.1, 12]} />
        <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.4} />
      </mesh>
      {Array.from({ length: folds }, (_, i) => (
        <mesh key={i} position={[-w / 2 + step * (i + 0.5), (h - 0.03) / 2, (i % 2 ? 0.25 : -0.25) * d]} castShadow receiveShadow>
          <cylinderGeometry args={[step * 0.62, step * 0.62, h - 0.03, 10, 1, true]} />
          <meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function LedStrip({ w, d, h, color }: ModelProps) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, Math.max(h, 0.008), Math.max(d, 0.008)]} />
        <Glow color={color} intensity={3} />
      </mesh>
      <pointLight position={[0, h / 2, 0.15]} intensity={0.9} distance={3} decay={2} color={color} />
    </group>
  );
}

function NeonSign({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, h) * 0.38;
  return (
    <group position={[0, h / 2, 0]}>
      <mesh position={[0, 0, -d / 2 + 0.004]}>
        <boxGeometry args={[w, h, 0.006]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.12} roughness={0.1} />
      </mesh>
      {/* Crescent moon and a star in glowing tube. */}
      <mesh position={[-w * 0.12, 0, 0.005]} rotation={[0, 0, Math.PI * 0.35]}>
        <torusGeometry args={[r, 0.008, 8, 48, Math.PI * 1.35]} />
        <Glow color={color} intensity={3.2} />
      </mesh>
      <mesh position={[-w * 0.04, 0, 0.005]} rotation={[0, 0, Math.PI * 0.42]}>
        <torusGeometry args={[r * 0.72, 0.008, 8, 48, Math.PI * 1.1]} />
        <Glow color={color} intensity={3.2} />
      </mesh>
      <mesh position={[w * 0.28, h * 0.18, 0.005]}>
        <octahedronGeometry args={[Math.min(w, h) * 0.07, 0]} />
        <Glow color={color} intensity={3.2} />
      </mesh>
      <pointLight position={[0, 0, 0.2]} intensity={0.7} distance={2.5} decay={2} color={color} />
    </group>
  );
}

function CornerLed({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, d) / 2;
  return (
    <group>
      <mesh position={[0, 0.01, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, 0.02, 24]} />
        <meshStandardMaterial color="#1f1f1f" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[0.03, h - 0.02, 0.03]} />
        <Glow color={color} intensity={3} />
      </mesh>
      <pointLight position={[0, h * 0.6, 0.1]} intensity={1} distance={3} decay={2} color={color} />
    </group>
  );
}

function Pendant({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, d) / 2;
  const shadeH = Math.min(0.25, h * 0.35);
  return (
    <group>
      <mesh position={[0, shadeH + (h - shadeH) / 2, 0]}>
        <cylinderGeometry args={[0.004, 0.004, h - shadeH, 6]} />
        <meshStandardMaterial color="#1f1f1f" />
      </mesh>
      <mesh position={[0, h - 0.01, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, shadeH / 2, 0]} castShadow>
        <cylinderGeometry args={[r * 0.25, r, shadeH, 32, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, shadeH * 0.25, 0]}>
        <sphereGeometry args={[0.04, 16, 12]} />
        <Glow color="#ffe2b3" intensity={2} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={1.2} distance={4} decay={2} color="#ffd8a8" />
    </group>
  );
}

function Vase({ w, d, h, color }: ModelProps) {
  const r = Math.min(w, d) / 2;
  const vaseH = h * 0.5;
  const flowers = useMemo(() => {
    const rnd = makeRng(11);
    return Array.from({ length: 5 }, () => ({ a: rnd() * Math.PI * 2, t: 0.15 + rnd() * 0.2, l: 0.8 + rnd() * 0.2 }));
  }, []);
  return (
    <group>
      <mesh position={[0, vaseH / 2, 0]} castShadow>
        <cylinderGeometry args={[r * 0.55, r * 0.8, vaseH, 24]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      {flowers.map((f, i) => {
        const len = (h - vaseH) * f.l;
        const tip: [number, number, number] = [Math.cos(f.a) * Math.sin(f.t) * len, vaseH + Math.cos(f.t) * len, Math.sin(f.a) * Math.sin(f.t) * len];
        return (
          <group key={i}>
            <mesh position={[tip[0] / 2, vaseH + (tip[1] - vaseH) / 2, tip[2] / 2]} rotation={[Math.sin(f.a) * f.t, 0, -Math.cos(f.a) * f.t]}>
              <cylinderGeometry args={[0.002, 0.002, len, 4]} />
              <meshStandardMaterial color="#4f7a45" />
            </mesh>
            <mesh position={tip} castShadow>
              <icosahedronGeometry args={[0.022, 0]} />
              <meshStandardMaterial color={["#f2d3d8", "#f7e7a6", "#ffffff"][i % 3]} roughness={0.8} flatShading />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Books({ w, d, h, color }: ModelProps) {
  const n = 3;
  const bh = h / n;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <Box
          key={i}
          size={[w * (1 - i * 0.08), bh - 0.002, d * (1 - i * 0.06)]}
          position={[(i % 2 ? 0.01 : -0.01), bh * (i + 0.5), 0]}
          rotation={[0, (i - 1) * 0.12, 0]}
          color={i === 0 ? color : i === 1 ? tone(color, 0.15, -0.1) : "#e9e2d0"}
          rough={0.8}
        />
      ))}
    </group>
  );
}

function Basket({ w, d, h, color }: ModelProps) {
  return (
    <group scale={[w, 1, d]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.42, h, 32, 6, true]} />
        <meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} wireframe={false} />
      </mesh>
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.01, 32]} />
        <meshStandardMaterial color={tone(color, -0.15)} roughness={1} />
      </mesh>
      <mesh position={[0, h * 0.75, 0]}>
        <torusGeometry args={[0.48, 0.012, 6, 40]} />
        <meshStandardMaterial color={tone(color, -0.2)} roughness={1} />
      </mesh>
      <mesh position={[0, h * 0.6, 0]} scale={[1, 0.3, 1]}>
        <sphereGeometry args={[0.38, 16, 10]} />
        <meshStandardMaterial color="#e8e2d6" roughness={1} />
      </mesh>
    </group>
  );
}

export function ExtraModel({ type, ...p }: ModelProps & { type: FurnitureType }) {
  switch (type) {
    case "sofa":
      return <Sofa {...p} />;
    case "bench":
      return <Bench {...p} />;
    case "pouf":
      return <Pouf {...p} />;
    case "side-table":
      return <SideTable {...p} />;
    case "floor-mirror":
      return <FloorMirror {...p} />;
    case "wall-mirror":
      return <WallMirror {...p} />;
    case "wall-shelf":
      return <WallShelf {...p} />;
    case "wall-panel":
      return <WallPanel {...p} />;
    case "wall-art":
      return <WallArt {...p} />;
    case "clock":
      return <Clock {...p} />;
    case "curtain":
      return <Curtain {...p} />;
    case "led-strip":
      return <LedStrip {...p} />;
    case "neon-sign":
      return <NeonSign {...p} />;
    case "corner-led":
      return <CornerLed {...p} />;
    case "pendant":
      return <Pendant {...p} />;
    case "vase":
      return <Vase {...p} />;
    case "books":
      return <Books {...p} />;
    case "basket":
      return <Basket {...p} />;
    default:
      return null;
  }
}
