"use client";

import { useRef } from "react";
import {
  Box,
  Camera,
  Download,
  LayoutGrid,
  PanelLeft,
  PanelRight,
  Redo2,
  Square,
  Upload,
  Undo2,
  CheckCircle2,
} from "lucide-react";
import { usePlanner } from "@/lib/store";
import { viewBridge } from "@/lib/bridge";
import { downloadPng, exportSceneJson, readSceneFile } from "@/lib/io";
import { toast } from "@/lib/toast";
import { Segmented } from "./fields";
import { TemplatesMenu } from "./TemplatesMenu";
import { CloudControls } from "../account/CloudControls";
import { useCloud } from "@/lib/cloud";

function IconButton({
  onClick,
  label,
  children,
  disabled,
  className = "",
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex size-8 items-center justify-center rounded-md text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 disabled:pointer-events-none disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  );
}

export function Toolbar({ onToggleLeft, onToggleRight }: { onToggleLeft: () => void; onToggleRight: () => void }) {
  const view = usePlanner((s) => s.view);
  const unit = usePlanner((s) => s.unit);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const savedAt = usePlanner((s) => s.savedAt);
  const roomName = usePlanner((s) => s.scene.room.name);
  const { setPref, undo, redo, loadScene } = usePlanner.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  const screenshot = async () => {
    const shot = viewBridge.screenshot;
    if (!shot) return;
    try {
      const url = await shot();
      downloadPng(url, roomName, view);
      toast("Screenshot saved");
    } catch {
      toast("Couldn’t capture the view", { tone: "error" });
    }
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-1 border-b sm:gap-2 border-stone-200 bg-white px-3">
      <IconButton onClick={onToggleLeft} label="Toggle catalogue" className="lg:hidden">
        <PanelLeft className="size-4" />
      </IconButton>
      <div className="flex min-w-0 items-center gap-2.5 pr-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white">
          <LayoutGrid className="size-4" strokeWidth={2.25} />
        </div>
        <div className="hidden min-w-0 md:block">
          <div className="text-[13px] leading-tight font-semibold whitespace-nowrap text-stone-900">Room Planner</div>
          <div className="truncate text-[11px] leading-tight text-stone-500">{roomName}</div>
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-stone-200" />
      <IconButton onClick={undo} disabled={!canUndo} label="Undo (⌘Z)">
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton onClick={redo} disabled={!canRedo} label="Redo (⇧⌘Z)">
        <Redo2 className="size-4" />
      </IconButton>

      <div className="ml-2 xl:absolute xl:left-1/2 xl:ml-0 xl:-translate-x-1/2">
        <Segmented
          ariaLabel="View"
          value={view}
          onChange={(v) => setPref("view", v)}
          options={[
            { value: "2d", label: <><Square className="size-3.5" /> 2D<span className="hidden sm:inline"> plan</span></>, title: "Top-down plan (press 2)" },
            { value: "3d", label: <><Box className="size-3.5" /> 3D<span className="hidden sm:inline"> view</span></>, title: "Interactive 3D (press 3)" },
          ]}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 hidden items-center gap-1 text-[11.5px] text-stone-400 2xl:flex" title="Changes are saved in this browser automatically">
          <CheckCircle2 className="size-3.5 text-emerald-500" />
          {savedAt ? "Saved locally" : "Autosave on"}
        </span>
        <Segmented
          size="sm"
          ariaLabel="Units"
          value={unit}
          onChange={(u) => setPref("unit", u)}
          options={[
            { value: "cm", label: "cm" },
            { value: "imperial", label: "ft·in" },
          ]}
        />
        <div className="mx-1 hidden h-6 w-px bg-stone-200 sm:block" />
        <TemplatesMenu />
        <IconButton className="max-sm:hidden" onClick={() => fileRef.current?.click()} label="Import plan (JSON)">
          <Upload className="size-4" />
        </IconButton>
        <IconButton className="max-sm:hidden" onClick={() => exportSceneJson(usePlanner.getState().scene)} label="Export plan (JSON)">
          <Download className="size-4" />
        </IconButton>
        <CloudControls />
        <button
          type="button"
          onClick={screenshot}
          className="ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-stone-900 px-2.5 sm:px-3 text-[12.5px] font-medium text-white transition hover:bg-stone-700"
        >
          <Camera className="size-3.5" />
          <span className="hidden md:inline">Screenshot</span>
        </button>
        <IconButton onClick={onToggleRight} label="Toggle properties" className="lg:hidden">
          <PanelRight className="size-4" />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const scene = await readSceneFile(file);
              loadScene(scene);
              useCloud.getState().detach();
              toast(`Imported “${scene.room.name}”`, { action: { label: "Undo", run: () => usePlanner.getState().undo() } });
            } catch (err) {
              toast(err instanceof Error ? err.message : "Import failed", { tone: "error" });
            }
          }}
        />
      </div>
    </header>
  );
}
