import type { FloorMaterial } from "./types";

export const FLOOR_LABELS: Record<FloorMaterial, string> = {
  oak: "Light oak",
  ash: "White ash",
  walnut: "Walnut",
  tile: "Stone tile",
  carpet: "Wool carpet",
  concrete: "Polished concrete",
};

/** Real-world size (cm) that one texture tile covers. */
export const FLOOR_TILE_CM: Record<FloorMaterial, number> = {
  oak: 240,
  ash: 240,
  walnut: 240,
  tile: 120,
  carpet: 80,
  concrete: 200,
};

/** Representative flat colour, used for swatches. */
export const FLOOR_SWATCH: Record<FloorMaterial, string> = {
  oak: "#cfa979",
  ash: "#e3d3bb",
  walnut: "#6e4a32",
  tile: "#d9d6d0",
  carpet: "#a7a19a",
  concrete: "#a9a8a4",
};

// Deterministic PRNG so the floor looks the same in both views and across reloads.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawPlanks(ctx: CanvasRenderingContext2D, size: number, base: string, rand: () => number) {
  const rows = 12; // 20 cm planks across a 240 cm tile
  const ph = size / rows;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let r = 0; r < rows; r++) {
    let x = -rand() * size * 0.5;
    while (x < size) {
      const len = size * (0.35 + rand() * 0.4);
      const tone = Math.round((rand() - 0.5) * 26);
      ctx.fillStyle = shade(base, tone);
      ctx.fillRect(x, r * ph, len, ph);
      // grain
      ctx.strokeStyle = shade(base, tone - 14);
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      for (let g = 0; g < 6; g++) {
        const y = r * ph + rand() * ph;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + len * 0.3, y + (rand() - 0.5) * 6, x + len * 0.7, y + (rand() - 0.5) * 6, x + len, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(base, -45);
      ctx.fillRect(x, r * ph, 1.5, ph);
      x += len;
    }
    ctx.fillStyle = shade(base, -40);
    ctx.fillRect(0, r * ph, size, 1.5);
  }
}

function drawNoise(ctx: CanvasRenderingContext2D, size: number, base: string, rand: () => number, amount: number, dot: number) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const count = (size * size) / (dot * dot) / 2;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = shade(base, Math.round((rand() - 0.5) * amount));
    ctx.globalAlpha = 0.5;
    ctx.fillRect(rand() * size, rand() * size, dot, dot);
  }
  ctx.globalAlpha = 1;
}

const cache = new Map<string, HTMLCanvasElement>();

export function floorCanvas(material: FloorMaterial, size = 1024): HTMLCanvasElement {
  const key = `${material}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = rng(material.length * 7919 + 17);
  switch (material) {
    case "oak":
      drawPlanks(ctx, size, "#cfa979", rand);
      break;
    case "ash":
      drawPlanks(ctx, size, "#e3d3bb", rand);
      break;
    case "walnut":
      drawPlanks(ctx, size, "#6e4a32", rand);
      break;
    case "tile": {
      drawNoise(ctx, size, "#dcd9d3", rand, 14, 3);
      const n = 2;
      const t = size / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = shade("#dcd9d3", Math.round((rand() - 0.5) * 10));
          ctx.globalAlpha = 0.5;
          ctx.fillRect(i * t, j * t, t, t);
        }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#b9b5ad";
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * t - 2, 0, 4, size);
        ctx.fillRect(0, i * t - 2, size, 4);
      }
      break;
    }
    case "carpet":
      drawNoise(ctx, size, "#a7a19a", rand, 30, 2);
      break;
    case "concrete": {
      drawNoise(ctx, size, "#aaa9a5", rand, 12, 4);
      for (let i = 0; i < 40; i++) {
        const g = ctx.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, size * 0.25);
        g.addColorStop(0, "rgba(255,255,255,0.05)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      break;
    }
  }
  cache.set(key, canvas);
  return canvas;
}

const urlCache = new Map<FloorMaterial, string>();
export function floorDataUrl(material: FloorMaterial): string {
  const hit = urlCache.get(material);
  if (hit) return hit;
  const url = floorCanvas(material, 512).toDataURL("image/jpeg", 0.85);
  urlCache.set(material, url);
  return url;
}
