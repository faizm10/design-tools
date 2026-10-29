"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { usePlanner, persist } from "@/lib/store";
import { viewBridge } from "@/lib/bridge";
import { catalogEntry } from "@/lib/catalog";
import { snapPosition, wallPosition } from "@/lib/geometry";
import { useToast } from "@/lib/toast";
import { Toolbar } from "./Toolbar";
import { Catalog, DRAG_MIME } from "./Catalog";
import { PropertiesPanel } from "./PropertiesPanel";
import { SceneOverlay } from "./SceneOverlay";
import PlanView from "../plan2d/PlanView";
import { CollabRoot } from "../collab/CollabSession";
import { presenceBridge } from "@/lib/collab/session";

const Scene3D = dynamic(() => import("../scene3d/Scene3D"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-[#efece7]" />,
});

export default function Planner() {
  const view = usePlanner((s) => s.view);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  useAutosave();
  useShortcuts();

  // On small screens, reveal properties when something gets selected.
  useEffect(
    () =>
      usePlanner.subscribe((s, prev) => {
        if (s.selection && s.selection !== prev.selection && window.matchMedia("(max-width: 1023px)").matches) setRightOpen(true);
      }),
    [],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const id = e.dataTransfer.getData(DRAG_MIME);
    const entry = catalogEntry(id);
    if (!entry) return;
    const st = usePlanner.getState();
    const p = viewBridge.screenToFloor?.(e.clientX, e.clientY);
    if (!p) {
      st.addFurniture(id);
      return;
    }
    const probe = { id: "probe", type: entry.type, catalogId: id, name: entry.name, x: p.x, z: p.z, rotation: 0, width: entry.width, depth: entry.depth, height: entry.height, color: entry.color };
    const snapped = snapPosition(probe, p, st.scene.room, st.scene.furniture, { grid: st.gridSnap ? st.gridSize : null, walls: st.wallSnap });
    st.addFurniture(id, snapped);
    setLeftOpen(false);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-stone-100 text-stone-900">
      <Toolbar onToggleLeft={() => setLeftOpen((v) => !v)} onToggleRight={() => setRightOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={`absolute inset-y-0 left-0 z-20 w-[288px] shrink-0 border-r border-stone-200 bg-white shadow-xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none ${
            leftOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Furniture catalogue"
        >
          <button type="button" onClick={() => setLeftOpen(false)} aria-label="Close catalogue" className="absolute top-3 right-3 z-10 rounded p-1 text-stone-400 hover:bg-stone-100 lg:hidden">
            <X className="size-4" />
          </button>
          <Catalog />
        </aside>

        <main
          className="relative min-w-0 flex-1"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dropActive) setDropActive(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false);
          }}
          onDrop={onDrop}
          // Share where this pointer is on the floor with collaborators (a no-op when not collaborating).
          onPointerMove={(e) => presenceBridge.setCursor?.(viewBridge.screenToFloor?.(e.clientX, e.clientY) ?? null)}
          onPointerLeave={() => presenceBridge.setCursor?.(null)}
        >
          <div key={view} className="animate-fade-in absolute inset-0">
            {view === "3d" ? <Scene3D /> : <PlanView />}
          </div>
          <SceneOverlay />
          {dropActive && (
            <div className="pointer-events-none absolute inset-2 z-20 flex items-start justify-center rounded-2xl border-2 border-dashed border-stone-900/30 bg-stone-900/[0.03]">
              <span className="mt-16 rounded-full bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg">Drop to place in the room</span>
            </div>
          )}
        </main>

        <aside
          className={`absolute inset-y-0 right-0 z-20 w-[320px] shrink-0 border-l border-stone-200 bg-white shadow-xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none ${
            rightOpen ? "translate-x-0" : "translate-x-full"
          }`}
          aria-label="Properties"
        >
          <button type="button" onClick={() => setRightOpen(false)} aria-label="Close properties" className="absolute top-3 right-3 z-10 rounded p-1 text-stone-400 hover:bg-stone-100 lg:hidden">
            <X className="size-4" />
          </button>
          <PropertiesPanel />
        </aside>
      </div>
      <Toaster />
      <CollabRoot />
    </div>
  );
}

function useAutosave() {
  const markSaved = usePlanner((s) => s.markSaved);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = usePlanner.subscribe((s, prev) => {
      const changed =
        s.scene !== prev.scene ||
        s.view !== prev.view ||
        s.unit !== prev.unit ||
        s.gridSnap !== prev.gridSnap ||
        s.gridSize !== prev.gridSize ||
        s.wallSnap !== prev.wallSnap ||
        s.wallVisibility !== prev.wallVisibility ||
        s.showDimensions !== prev.showDimensions;
      if (!changed) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (persist(usePlanner.getState())) markSaved();
      }, 400);
    });
    const flush = () => persist(usePlanner.getState());
    window.addEventListener("beforeunload", flush);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener("beforeunload", flush);
    };
  }, [markSaved]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const st = usePlanner.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        st.duplicateSelected();
        return;
      }
      if (mod) return;
      if (key === "2") st.setPref("view", "2d");
      else if (key === "3") st.setPref("view", "3d");
      else if (key === "escape") st.select(null);
      else if (key === "delete" || key === "backspace") {
        if (st.selection) {
          e.preventDefault();
          st.deleteSelected();
        }
      } else if (key === "r") st.rotateSelected(e.shiftKey ? -90 : 90);
      else if (key === "f" && (st.selection?.kind === "opening" || st.selection?.kind === "space")) st.flipDoor(st.selection.id);
      else if (key.startsWith("arrow") && st.selection) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : st.gridSnap ? st.gridSize : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dz = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        const sel = st.selection;
        if (sel.kind === "furniture") {
          const it = st.scene.furniture.find((f) => f.id === sel.id);
          if (it) st.updateFurniture(it.id, { x: Math.round((it.x + dx) * 10) / 10, z: Math.round((it.z + dz) * 10) / 10 }, `nudge-${it.id}`);
        } else if (sel.kind === "wall") {
          // Arrows push the wall along its normal, e.g. ← moves the west wall out and the east wall in.
          const d = sel.wall === "north" || sel.wall === "south" ? dz : dx;
          if (d) st.moveWall(sel.wall, wallPosition(st.scene.room, sel.wall) + d, `nudge-${sel.wall}`);
        } else if (sel.kind === "space") {
          const sp = st.scene.room.spaces.find((x) => x.id === sel.id);
          if (sp) st.updateSpace(sp.id, { x: Math.round((sp.x + dx) * 10) / 10, z: Math.round((sp.z + dz) * 10) / 10 }, `nudge-${sp.id}`);
        } else if (sel.kind === "alcove") {
          const a = st.scene.room.alcoves.find((x) => x.id === sel.id);
          if (a) st.updateAlcove(a.id, { offset: a.offset + (a.wall === "north" || a.wall === "south" ? dx : dz) }, `nudge-${a.id}`);
        } else {
          const o = st.scene.openings.find((x) => x.id === sel.id);
          if (o) st.updateOpening(o.id, { offset: o.offset + (o.wall === "north" || o.wall === "south" ? dx : dz) }, `nudge-${o.id}`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Toaster() {
  const t = useToast((s) => s.toast);
  const dismiss = useToast((s) => s.dismiss);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(dismiss, 4000);
    return () => clearTimeout(timer);
  }, [t, dismiss]);
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        key={t.id}
        role="status"
        className={`animate-toast-in pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-xl ${t.tone === "error" ? "bg-red-600 text-white" : "bg-stone-900 text-white"}`}
      >
        {t.message}
        {t.action && (
          <button
            type="button"
            onClick={() => {
              t.action!.run();
              dismiss();
            }}
            className="rounded-md bg-white/15 px-2 py-0.5 text-[12px] hover:bg-white/25"
          >
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
