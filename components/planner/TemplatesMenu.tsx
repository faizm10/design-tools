"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import { alcoveRect, footprint, wallFrame } from "@/lib/geometry";
import { toast } from "@/lib/toast";
import { useCloud } from "@/lib/cloud";
import type { Scene } from "@/lib/types";

/** Tiny plan preview: room outline, furniture footprints and wall openings. */
function TemplatePreview({ scene }: { scene: Scene }) {
  const { room } = scene;
  const pad = Math.max(room.width, room.length) * 0.06 + Math.max(0, ...room.alcoves.map((a) => a.depth));
  return (
    <svg viewBox={`${-pad} ${-pad} ${room.width + pad * 2} ${room.length + pad * 2}`} className="h-12 w-16 shrink-0" aria-hidden>
      {room.alcoves.map((a) => {
        const r = alcoveRect(room, a);
        return <rect key={a.id} x={r.minX} y={r.minZ} width={r.maxX - r.minX} height={r.maxZ - r.minZ} fill="#efe6d6" stroke="#3b3733" strokeWidth={pad * 0.6} />;
      })}
      <rect width={room.width} height={room.length} fill="#efe6d6" stroke="#3b3733" strokeWidth={pad * 0.6} />
      {scene.furniture.map((f) => (
        <polygon key={f.id} points={footprint(f).map((p) => `${p.x},${p.z}`).join(" ")} fill={f.color} stroke="#3b3733" strokeWidth={pad * 0.15} />
      ))}
      {scene.openings.map((o) => {
        const fr = wallFrame(room, o.wall);
        const a = o.offset - o.width / 2;
        const b = o.offset + o.width / 2;
        return (
          <line
            key={o.id}
            x1={fr.start.x + fr.dir.x * a}
            y1={fr.start.z + fr.dir.z * a}
            x2={fr.start.x + fr.dir.x * b}
            y2={fr.start.z + fr.dir.z * b}
            stroke={o.kind === "door" ? "#f4f2ee" : "#9cc3e6"}
            strokeWidth={pad * 0.7}
          />
        );
      })}
    </svg>
  );
}

export function TemplatesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loadTemplate = usePlanner((s) => s.loadTemplate);
  const previews = useMemo(() => TEMPLATES.map((t) => ({ ...t, scene: t.build() })), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative max-sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Start from a template"
        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 ${open ? "bg-stone-100 text-stone-900" : ""}`}
      >
        <LayoutTemplate className="size-4" />
        <span className="hidden lg:inline">Templates</span>
        <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="animate-panel-in absolute top-10 right-0 z-40 w-80 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-stone-200">
          <p className="px-2.5 pt-1.5 pb-2 text-[11.5px] text-stone-500">Replaces the current plan. You can undo this.</p>
          {previews.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                loadTemplate(t.id);
                // A template is a new room, so the next Save creates a new plan.
                useCloud.getState().detach();
                setOpen(false);
                toast(`Loaded “${t.name}”`, { action: { label: "Undo", run: () => usePlanner.getState().undo() } });
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-stone-100"
            >
              <TemplatePreview scene={t.scene} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-stone-900">{t.name}</span>
                <span className="block text-[11.5px] leading-snug text-stone-500">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
