"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  Magnet,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Scan,
  Sofa,
  Trash2,
} from "lucide-react";
import { usePlanner } from "@/lib/store";
import { viewBridge } from "@/lib/bridge";
import type { WallVisibility } from "@/lib/types";
import { useWarnings } from "./useWarnings";
import { TEMPLATES } from "@/lib/templates";
import { useCloud } from "@/lib/cloud";

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`pointer-events-auto flex items-center gap-0.5 rounded-xl bg-white/95 p-1 shadow-lg ring-1 shadow-stone-900/5 ring-stone-200 backdrop-blur ${className}`}>{children}</div>;
}

function Btn({
  onClick,
  label,
  children,
  active,
  wide,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition ${wide ? "px-2.5" : "w-8"} ${
        active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

const WALL_MODES: { value: WallVisibility; label: string; icon: React.ReactNode }[] = [
  { value: "auto", label: "Auto-hide walls", icon: <Scan className="size-4" /> },
  { value: "all", label: "Show all walls", icon: <Eye className="size-4" /> },
  { value: "cutaway", label: "Cut away walls", icon: <EyeOff className="size-4" /> },
];

export function SceneOverlay() {
  const view = usePlanner((s) => s.view);
  const gridSnap = usePlanner((s) => s.gridSnap);
  const gridSize = usePlanner((s) => s.gridSize);
  const wallSnap = usePlanner((s) => s.wallSnap);
  const showDims = usePlanner((s) => s.showDimensions);
  const wallMode = usePlanner((s) => s.wallVisibility);
  const selection = usePlanner((s) => s.selection);
  const dragging = usePlanner((s) => s.dragging);
  const furnitureCount = usePlanner((s) => s.scene.furniture.length);
  const selectedName = usePlanner((s) =>
    s.selection?.kind === "furniture" ? s.scene.furniture.find((f) => f.id === s.selection!.id)?.name : s.selection?.kind === "opening" ? (s.scene.openings.find((o) => o.id === s.selection!.id)?.kind === "door" ? "Door" : "Window") : undefined,
  );
  const { setPref, rotateSelected, duplicateSelected, deleteSelected, select, loadTemplate } = usePlanner.getState();
  const { list } = useWarnings();
  const [showIssues, setShowIssues] = useState(false);
  const wm = WALL_MODES.find((m) => m.value === wallMode)!;
  const issueItems = [...new Map(list.map((w) => [w.itemId + w.message, w])).values()];

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Snapping and display options */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        <Pill>
          <Btn onClick={() => setPref("gridSnap", !gridSnap)} active={gridSnap} label="Snap to grid" wide>
            <Grid3x3 className="size-4" /> <span className="hidden sm:inline">Grid</span>
          </Btn>
          <select
            aria-label="Grid size"
            value={gridSize}
            onChange={(e) => setPref("gridSize", Number(e.target.value))}
            className="h-8 rounded-lg bg-transparent px-1 text-[12px] font-medium text-stone-600 outline-none hover:bg-stone-100"
          >
            {[1, 5, 10, 25].map((g) => (
              <option key={g} value={g}>
                {g} cm
              </option>
            ))}
          </select>
          <div className="mx-0.5 h-5 w-px bg-stone-200" />
          <Btn onClick={() => setPref("wallSnap", !wallSnap)} active={wallSnap} label="Snap to walls and furniture" wide>
            <Magnet className="size-4" /> <span className="hidden sm:inline">Snap</span>
          </Btn>
          <Btn onClick={() => setPref("showDimensions", !showDims)} active={showDims} label="Show dimensions" wide>
            <Ruler className="size-4" /> <span className="hidden sm:inline">Dimensions</span>
          </Btn>
        </Pill>
      </div>

      {/* Contextual actions for the selection */}
      {selection && selectedName && (
        <div className={`absolute top-3 right-3 transition-opacity ${dragging ? "opacity-40" : "opacity-100"}`}>
          <Pill className="animate-panel-in">
            <span className="max-w-40 truncate px-2.5 text-[12.5px] font-semibold text-stone-800">{selectedName}</span>
            {selection.kind === "furniture" && (
              <>
                <div className="mx-0.5 h-5 w-px bg-stone-200" />
                <Btn onClick={() => rotateSelected(-90)} label="Rotate left 90°">
                  <RotateCcw className="size-4" />
                </Btn>
                <Btn onClick={() => rotateSelected(90)} label="Rotate right 90° (R)">
                  <RotateCw className="size-4" />
                </Btn>
                <Btn onClick={duplicateSelected} label="Duplicate (⌘D)">
                  <Copy className="size-4" />
                </Btn>
              </>
            )}
            <Btn onClick={deleteSelected} label="Delete (Del)">
              <Trash2 className="size-4 text-red-600" />
            </Btn>
          </Pill>
        </div>
      )}

      {/* Camera controls */}
      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
        {view === "3d" && (
          <Pill>
            <Btn
              onClick={() => setPref("wallVisibility", WALL_MODES[(WALL_MODES.indexOf(wm) + 1) % WALL_MODES.length].value)}
              label={`${wm.label} — click to change`}
              wide
            >
              {wm.icon}
              <span>{wm.label.replace(" walls", "")}</span>
            </Btn>
          </Pill>
        )}
        <Pill className="flex-col">
          <Btn onClick={() => viewBridge.zoom?.(1.25)} label="Zoom in">
            <Plus className="size-4" />
          </Btn>
          <Btn onClick={() => viewBridge.zoom?.(0.8)} label="Zoom out">
            <Minus className="size-4" />
          </Btn>
          <div className="my-0.5 h-px w-5 bg-stone-200" />
          <Btn onClick={() => viewBridge.resetCamera?.()} label={view === "3d" ? "Reset camera" : "Fit room to screen"}>
            <Maximize className="size-4" />
          </Btn>
        </Pill>
      </div>

      {/* Issues */}
      <div className="absolute bottom-3 left-3 max-w-[min(360px,calc(100%-90px))]">
        {issueItems.length === 0 ? (
          furnitureCount > 0 && (
            <Pill className="px-2.5 py-1.5 text-[12px] font-medium text-stone-600">
              <CheckCircle2 className="mr-1 size-4 text-emerald-500" /> Everything fits
            </Pill>
          )
        ) : (
          <div className="pointer-events-auto overflow-hidden rounded-xl bg-white/95 shadow-lg ring-1 ring-red-200 backdrop-blur">
            <button type="button" onClick={() => setShowIssues((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-red-700" aria-expanded={showIssues}>
              <AlertTriangle className="size-4" />
              {issueItems.length} {issueItems.length === 1 ? "issue" : "issues"} to review
              <ChevronDown className={`ml-auto size-4 transition ${showIssues ? "rotate-180" : ""}`} />
            </button>
            {showIssues && (
              <ul className="max-h-48 overflow-y-auto border-t border-red-100 py-1">
                {issueItems.map((w) => (
                  <li key={w.itemId + w.message}>
                    <button type="button" onClick={() => select({ kind: "furniture", id: w.itemId })} className="w-full px-3 py-1.5 text-left text-[12px] text-stone-700 hover:bg-red-50">
                      {w.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {furnitureCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="animate-panel-in pointer-events-auto max-w-xs rounded-2xl bg-white/95 p-6 text-center shadow-xl ring-1 ring-stone-200 backdrop-blur">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-stone-100">
              <Sofa className="size-5 text-stone-500" />
            </div>
            <h3 className="text-[14px] font-semibold text-stone-900">This room is empty</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">Drag furniture from the catalogue on the left, or start from a template.</p>
            <div className="mt-4 flex flex-col gap-2">
              {TEMPLATES.filter((t) => t.id !== "empty").map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    loadTemplate(t.id);
                    useCloud.getState().detach();
                  }}
                  className={`rounded-lg px-3.5 py-2 text-[12.5px] font-medium ${i === 0 ? "bg-stone-900 text-white hover:bg-stone-700" : "text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}
                >
                  Load “{t.name}”
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
