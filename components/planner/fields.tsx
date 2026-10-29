"use client";

import { useId, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cmToFeetInches, feetInchesToCm } from "@/lib/units";
import type { Unit } from "@/lib/types";

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-stone-200/80 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function FieldRow({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="shrink-0 text-[13px] text-stone-600">
        {label}
      </label>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-stone-200 bg-white px-2 text-right text-[13px] tabular-nums text-stone-800 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5";

/** Number input that commits on blur/Enter and steps with arrow keys (Shift ×10). */
export function NumberField({
  value,
  onCommit,
  suffix,
  step = 1,
  min = -Infinity,
  max = Infinity,
  width = "w-24",
  id,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number, stepped?: boolean) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  width?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);

  const commit = (raw: string, stepped = false) => {
    const v = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(v)) {
      setDraft(fmt(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    setDraft(fmt(clamped));
    if (clamped !== value) onCommit(clamped, stepped);
  };

  return (
    <div className={`relative ${width}`}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        className={`${inputCls} ${suffix ? "pr-8" : ""}`}
        value={focused ? draft : fmt(value)}
        onFocus={(e) => {
          setDraft(fmt(value));
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.currentTarget.value);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(fmt(value));
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = parseFloat(draft) || value;
            const next = base + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            commit(String(next), true);
          }
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-stone-400">{suffix}</span>}
    </div>
  );
}

/** Length input in the current unit system. Values are always centimetres. */
export function LengthField({
  value,
  onCommit,
  unit,
  min = 0,
  max = 5000,
  id,
  label,
}: {
  value: number;
  onCommit: (cm: number, stepped?: boolean) => void;
  unit: Unit;
  min?: number;
  max?: number;
  id?: string;
  label: string;
}) {
  if (unit === "cm") {
    return <NumberField id={id} ariaLabel={label} value={value} onCommit={onCommit} suffix="cm" min={min} max={max} width="w-28" />;
  }
  const { ft, inch } = cmToFeetInches(value);
  const clamp = (cm: number) => Math.round(Math.min(max, Math.max(min, cm)) * 10) / 10;
  return (
    <div className="flex gap-1.5">
      <NumberField
        id={id}
        ariaLabel={`${label} feet`}
        value={ft}
        onCommit={(v, s) => onCommit(clamp(feetInchesToCm(v, inch)), s)}
        suffix="ft"
        min={0}
        width="w-[68px]"
      />
      <NumberField
        ariaLabel={`${label} inches`}
        value={inch}
        onCommit={(v, s) => onCommit(clamp(feetInchesToCm(ft, v)), s)}
        suffix="in"
        step={0.5}
        min={-12}
        max={120}
        width="w-[68px]"
      />
    </div>
  );
}

export function ColorField({
  value,
  swatches,
  onChange,
  label,
}: {
  value: string;
  swatches: string[];
  onChange: (hex: string, live?: boolean) => void;
  label: string;
}) {
  const id = useId();
  const isCustom = !swatches.some((s) => s.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      {swatches.map((c) => {
        const active = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c}
            title={c}
            onClick={() => onChange(c)}
            className={`relative size-7 rounded-full ring-1 ring-black/10 transition hover:scale-105 ${active ? "ring-2 ring-stone-900 ring-offset-2" : ""}`}
            style={{ background: c }}
          >
            {active && <Check className="absolute inset-0 m-auto size-3.5 text-white mix-blend-difference" strokeWidth={3} />}
          </button>
        );
      })}
      <label
        htmlFor={id}
        title="Custom colour"
        className={`relative size-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/10 transition hover:scale-105 ${isCustom ? "ring-2 ring-stone-900 ring-offset-2" : ""}`}
        style={{ background: isCustom ? value : "conic-gradient(#f87171,#facc15,#4ade80,#38bdf8,#a78bfa,#f87171)" }}
      >
        <input id={id} type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value, true)} />
      </label>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg bg-stone-100 p-0.5 ring-1 ring-stone-200/70">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md font-medium transition ${size === "sm" ? "h-7 px-2 text-[12px]" : "h-8 px-3 text-[13px]"} ${
            value === o.value ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-[13px] text-stone-600"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-stone-900" : "bg-stone-300"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
