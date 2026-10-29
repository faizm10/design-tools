import type { Unit } from "./types";

export const CM_PER_INCH = 2.54;

export function cmToFeetInches(cm: number): { ft: number; inch: number } {
  const totalIn = cm / CM_PER_INCH;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round((totalIn - ft * 12) * 2) / 2; // half-inch precision
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  return { ft, inch };
}

export function feetInchesToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_INCH;
}

export function formatLength(cm: number, unit: Unit): string {
  if (unit === "cm") {
    const r = Math.round(cm * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)} cm`;
  }
  const sign = cm < 0 ? "-" : "";
  const { ft, inch } = cmToFeetInches(Math.abs(cm));
  if (ft === 0) return `${sign}${inch}″`;
  return `${sign}${ft}′ ${inch}″`;
}

export function formatDims(w: number, d: number, unit: Unit, h?: number): string {
  if (unit === "cm") {
    const parts = [w, d, h].filter((v): v is number => v !== undefined).map((v) => Math.round(v));
    return `${parts.join(" × ")} cm`;
  }
  const parts = [w, d, h].filter((v): v is number => v !== undefined).map((v) => formatLength(v, unit));
  return parts.join(" × ");
}
