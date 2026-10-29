"use client";

import { nanoid } from "nanoid";
import { AlertTriangle, Copy, DoorOpen, MousePointerClick, Plus, RotateCw, Trash2, AppWindow, ChevronRight } from "lucide-react";
import { catalogEntry, isSurfaceItem } from "@/lib/catalog";
import { usePlanner } from "@/lib/store";
import { FLOOR_LABELS, FLOOR_SWATCH, floorDataUrl } from "@/lib/textures";
import { formatDims, formatLength } from "@/lib/units";
import { wallLength } from "@/lib/geometry";
import type { Alcove, FloorMaterial, FurnitureItem, Opening, WallSide } from "@/lib/types";
import { ColorField, FieldRow, LengthField, NumberField, Section, Segmented } from "./fields";
import { Thumbnail } from "./Catalog";
import { useWarnings } from "./useWarnings";

const WALL_COLORS = ["#ece8e1", "#f6f4ef", "#d9d3c7", "#c8cfc6", "#b9c4cc", "#e6d5c3", "#a3a89b", "#5d6b73"];
const FLOORS: FloorMaterial[] = ["oak", "ash", "walnut", "tile", "carpet", "concrete"];

export function PropertiesPanel() {
  const selection = usePlanner((s) => s.selection);
  const furniture = usePlanner((s) => s.scene.furniture);
  const openings = usePlanner((s) => s.scene.openings);
  const item = selection?.kind === "furniture" ? furniture.find((f) => f.id === selection.id) : undefined;
  const opening = selection?.kind === "opening" ? openings.find((o) => o.id === selection.id) : undefined;

  return (
    <div key={selection ? selection.id : "room"} className="animate-panel-in h-full overflow-y-auto">
      {item ? <FurnitureProps it={item} /> : opening ? <OpeningProps o={opening} /> : <RoomProps />}
    </div>
  );
}

function PanelHeader({ title, subtitle, icon }: { title: React.ReactNode; subtitle: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-stone-200/80 px-4 py-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-stone-100 ring-1 ring-stone-200/70">{icon}</div>
      <div className="min-w-0 flex-1">
        {title}
        <p className="truncate text-[12px] text-stone-500">{subtitle}</p>
      </div>
    </div>
  );
}

function ActionButton({ onClick, icon, label, danger, shortcut }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean; shortcut?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[11.5px] font-medium ring-1 transition ${
        danger ? "text-red-600 ring-red-100 hover:bg-red-50" : "text-stone-700 ring-stone-200 hover:bg-stone-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function WarningList({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div className="mx-4 mt-4 space-y-1.5 rounded-lg bg-red-50 p-3 ring-1 ring-red-100">
      {messages.map((m, i) => (
        <p key={i} className="flex items-start gap-2 text-[12px] text-red-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {m}
        </p>
      ))}
    </div>
  );
}

function FurnitureProps({ it }: { it: FurnitureItem }) {
  const unit = usePlanner((s) => s.unit);
  const update = usePlanner((s) => s.updateFurniture);
  const { duplicateSelected, deleteSelected, rotateSelected } = usePlanner.getState();
  const room = usePlanner((s) => s.scene.room);
  const { byItem } = useWarnings();
  const entry = catalogEntry(it.catalogId);
  const set = (patch: Partial<FurnitureItem>, key?: string) => update(it.id, patch, key);

  return (
    <>
      <PanelHeader
        icon={<Thumbnail entry={it} size={40} />}
        title={
          <input
            aria-label="Item name"
            className="-ml-1 w-full rounded px-1 text-[15px] font-semibold text-stone-900 outline-none hover:bg-stone-100 focus:bg-white focus:ring-2 focus:ring-stone-900/10"
            value={it.name}
            onChange={(e) => set({ name: e.target.value }, `name-${it.id}`)}
          />
        }
        subtitle={`${entry?.name ?? it.type} · ${formatDims(it.width, it.depth, unit, it.height)}`}
      />
      <div className="flex gap-2 px-4 pt-4">
        <ActionButton onClick={() => rotateSelected(90)} icon={<RotateCw className="size-4" />} label="Rotate 90°" shortcut="R" />
        <ActionButton onClick={duplicateSelected} icon={<Copy className="size-4" />} label="Duplicate" shortcut="⌘D" />
        <ActionButton onClick={deleteSelected} icon={<Trash2 className="size-4" />} label="Delete" danger shortcut="Del" />
      </div>
      <WarningList messages={(byItem.get(it.id) ?? []).map((w) => w.message)} />

      <Section title="Position">
        <FieldRow label="From west wall" htmlFor="pos-x">
          <LengthField id="pos-x" label="Position X" unit={unit} value={it.x} min={-1000} max={room.width + 1000} onCommit={(v) => set({ x: v }, `x-${it.id}`)} />
        </FieldRow>
        <FieldRow label="From north wall" htmlFor="pos-z">
          <LengthField id="pos-z" label="Position Y" unit={unit} value={it.z} min={-1000} max={room.length + 1000} onCommit={(v) => set({ z: v }, `z-${it.id}`)} />
        </FieldRow>
        <p className="-mt-1 text-[11px] text-stone-400">Measured to the item’s centre.</p>
        <FieldRow label="Height off floor" htmlFor="elev">
          <LengthField id="elev" label="Height off floor" unit={unit} value={it.elevation ?? 0} min={0} max={room.height} onCommit={(v) => set({ elevation: v }, `el-${it.id}`)} />
        </FieldRow>
        {isSurfaceItem(it.type) && !(it.elevation ?? 0) && <p className="-mt-1 text-[11px] text-stone-400">At 0 it rests on the furniture beneath it.</p>}
        <FieldRow label="Rotation" htmlFor="rot">
          <NumberField id="rot" value={it.rotation} suffix="°" step={15} onCommit={(v) => set({ rotation: ((v % 360) + 360) % 360 }, `rot-${it.id}`)} width="w-24" />
        </FieldRow>
        <div className="flex justify-end">
          <Segmented
            size="sm"
            ariaLabel="Rotation presets"
            value={String(it.rotation) as "0"}
            onChange={(v) => set({ rotation: Number(v) })}
            options={["0", "90", "180", "270"].map((v) => ({ value: v as "0", label: `${v}°` }))}
          />
        </div>
      </Section>

      <Section title="Size">
        <FieldRow label="Width" htmlFor="w">
          <LengthField id="w" label="Width" unit={unit} value={it.width} min={5} max={1000} onCommit={(v) => set({ width: v }, `w-${it.id}`)} />
        </FieldRow>
        <FieldRow label="Depth" htmlFor="d">
          <LengthField id="d" label="Depth" unit={unit} value={it.depth} min={5} max={1000} onCommit={(v) => set({ depth: v }, `d-${it.id}`)} />
        </FieldRow>
        <FieldRow label="Height" htmlFor="h">
          <LengthField id="h" label="Height" unit={unit} value={it.height} min={1} max={600} onCommit={(v) => set({ height: v }, `h-${it.id}`)} />
        </FieldRow>
        {entry && (entry.width !== it.width || entry.depth !== it.depth || entry.height !== it.height) && (
          <button
            type="button"
            onClick={() => set({ width: entry.width, depth: entry.depth, height: entry.height })}
            className="text-[12px] font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
          >
            Reset to catalogue size ({formatDims(entry.width, entry.depth, unit, entry.height)})
          </button>
        )}
      </Section>

      <Section title="Colour">
        <ColorField label="Furniture colour" value={it.color} swatches={entry?.colors ?? []} onChange={(c, live) => set({ color: c }, live ? `color-${it.id}` : undefined)} />
      </Section>
    </>
  );
}

const WALL_OPTIONS: { value: WallSide; label: string }[] = [
  { value: "north", label: "N" },
  { value: "east", label: "E" },
  { value: "south", label: "S" },
  { value: "west", label: "W" },
];

function OpeningProps({ o }: { o: Opening }) {
  const unit = usePlanner((s) => s.unit);
  const room = usePlanner((s) => s.scene.room);
  const update = usePlanner((s) => s.updateOpening);
  const del = usePlanner((s) => s.deleteSelected);
  const set = (patch: Partial<Opening>, key?: string) => update(o.id, patch, key);
  const len = wallLength(room, o.wall);
  const isDoor = o.kind === "door";

  return (
    <>
      <PanelHeader
        icon={isDoor ? <DoorOpen className="size-5 text-stone-600" /> : <AppWindow className="size-5 text-stone-600" />}
        title={<h2 className="text-[15px] font-semibold text-stone-900">{isDoor ? "Door" : "Window"}</h2>}
        subtitle={`${o.wall[0].toUpperCase()}${o.wall.slice(1)} wall · ${formatLength(o.width, unit)} wide`}
      />
      <div className="flex gap-2 px-4 pt-4">
        <ActionButton onClick={del} icon={<Trash2 className="size-4" />} label={`Remove ${isDoor ? "door" : "window"}`} danger shortcut="Del" />
      </div>
      <Section title="Placement">
        <FieldRow label="Wall">
          <Segmented size="sm" ariaLabel="Wall" value={o.wall} onChange={(wall) => set({ wall })} options={WALL_OPTIONS} />
        </FieldRow>
        <FieldRow label={o.wall === "north" || o.wall === "south" ? "From west corner" : "From north corner"} htmlFor="o-off">
          <LengthField id="o-off" label="Offset" unit={unit} value={o.offset - o.width / 2} min={0} max={len - o.width} onCommit={(v) => set({ offset: v + o.width / 2 }, `off-${o.id}`)} />
        </FieldRow>
        {isDoor && (
          <FieldRow label="Hinge">
            <Segmented
              size="sm"
              ariaLabel="Hinge side"
              value={o.hinge}
              onChange={(hinge) => set({ hinge })}
              options={[
                { value: "start", label: o.wall === "north" || o.wall === "south" ? "West" : "North" },
                { value: "end", label: o.wall === "north" || o.wall === "south" ? "East" : "South" },
              ]}
            />
          </FieldRow>
        )}
      </Section>
      <Section title="Size">
        <FieldRow label="Width" htmlFor="o-w">
          <LengthField id="o-w" label="Width" unit={unit} value={o.width} min={30} max={len} onCommit={(v) => set({ width: v }, `ow-${o.id}`)} />
        </FieldRow>
        <FieldRow label="Height" htmlFor="o-h">
          <LengthField id="o-h" label="Height" unit={unit} value={o.height} min={20} max={room.height} onCommit={(v) => set({ height: v }, `oh-${o.id}`)} />
        </FieldRow>
        {!isDoor && (
          <FieldRow label="Sill height" htmlFor="o-s">
            <LengthField id="o-s" label="Sill height" unit={unit} value={o.sill} min={0} max={room.height - 20} onCommit={(v) => set({ sill: v }, `os-${o.id}`)} />
          </FieldRow>
        )}
      </Section>
      <p className="px-4 py-3 text-[12px] text-stone-500">Tip: drag a {isDoor ? "door" : "window"} along the walls in either view — it hops to whichever wall is closest.</p>
    </>
  );
}

function RoomProps() {
  const unit = usePlanner((s) => s.unit);
  const room = usePlanner((s) => s.scene.room);
  const openings = usePlanner((s) => s.scene.openings);
  const furniture = usePlanner((s) => s.scene.furniture);
  const { updateRoom, addOpening, select } = usePlanner.getState();
  const { byItem } = useWarnings();

  return (
    <>
      <div className="border-b border-stone-200/80 px-4 py-4">
        <input
          aria-label="Room name"
          className="-ml-1 w-full rounded px-1 text-[15px] font-semibold text-stone-900 outline-none hover:bg-stone-100 focus:bg-white focus:ring-2 focus:ring-stone-900/10"
          value={room.name}
          onChange={(e) => updateRoom({ name: e.target.value }, "room-name")}
        />
        <p className="text-[12px] text-stone-500">
          {formatLength(room.width, unit)} × {formatLength(room.length, unit)} · {((room.width * room.length) / 10000).toFixed(1)} m²
        </p>
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200/70">
          <MousePointerClick className="mt-0.5 size-4 shrink-0 text-stone-400" />
          <p className="text-[12px] leading-relaxed text-stone-600">
            Select any piece of furniture, door or window to edit it. Drag items from the catalogue to add more.
          </p>
        </div>
      </div>

      <Section title="Room size">
        <FieldRow label="Width (W–E)" htmlFor="r-w">
          <LengthField id="r-w" label="Room width" unit={unit} value={room.width} min={150} max={2000} onCommit={(v) => updateRoom({ width: v }, "room-w")} />
        </FieldRow>
        <FieldRow label="Length (N–S)" htmlFor="r-l">
          <LengthField id="r-l" label="Room length" unit={unit} value={room.length} min={150} max={2000} onCommit={(v) => updateRoom({ length: v }, "room-l")} />
        </FieldRow>
        <FieldRow label="Ceiling height" htmlFor="r-h">
          <LengthField id="r-h" label="Ceiling height" unit={unit} value={room.height} min={200} max={500} onCommit={(v) => updateRoom({ height: v }, "room-h")} />
        </FieldRow>
      </Section>

      <Section title="Walls">
        <ColorField label="Wall colour" value={room.wallColor} swatches={WALL_COLORS} onChange={(c, live) => updateRoom({ wallColor: c }, live ? "wall-color" : undefined)} />
      </Section>

      <Section title="Floor">
        <div className="grid grid-cols-3 gap-2">
          {FLOORS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => updateRoom({ floor: f })}
              aria-pressed={room.floor === f}
              className={`overflow-hidden rounded-lg text-left ring-1 transition ${room.floor === f ? "ring-2 ring-stone-900" : "ring-stone-200 hover:ring-stone-300"}`}
            >
              <div className="h-10 bg-cover" style={{ backgroundImage: `url(${floorDataUrl(f)})`, backgroundColor: FLOOR_SWATCH[f], backgroundSize: "160%" }} />
              <div className="truncate px-1.5 py-1 text-[11px] font-medium text-stone-700">{FLOOR_LABELS[f]}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Doors & windows"
        action={
          <div className="flex gap-1">
            <button type="button" onClick={() => addOpening("door")} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
              <Plus className="size-3" /> Door
            </button>
            <button type="button" onClick={() => addOpening("window")} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
              <Plus className="size-3" /> Window
            </button>
          </div>
        }
      >
        {openings.length === 0 ? (
          <p className="text-[12px] text-stone-500">No doors or windows yet. Add one, then drag it along a wall.</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {openings.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: "opening", id: o.id })}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-100"
                >
                  {o.kind === "door" ? <DoorOpen className="size-4 text-stone-400" /> : <AppWindow className="size-4 text-stone-400" />}
                  <span className="flex-1">
                    {o.kind === "door" ? "Door" : "Window"} <span className="text-stone-400">· {o.wall}</span>
                  </span>
                  <span className="text-[12px] text-stone-400 tabular-nums">{formatLength(o.width, unit)}</span>
                  <ChevronRight className="size-3.5 text-stone-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <AlcovesSection />

      <Section title={`In this room (${furniture.length})`}>
        {furniture.length === 0 ? (
          <p className="text-[12px] text-stone-500">The room is empty. Drag a bed from the catalogue to get started.</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {furniture.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: "furniture", id: f.id })}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-[13px] text-stone-700 hover:bg-stone-100"
                >
                  <Thumbnail entry={f} size={22} />
                  <span className="flex-1 truncate">{f.name}</span>
                  {byItem.has(f.id) && <AlertTriangle className="size-3.5 text-red-500" aria-label="Has warnings" />}
                  <ChevronRight className="size-3.5 text-stone-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function AlcovesSection() {
  const unit = usePlanner((s) => s.unit);
  const room = usePlanner((s) => s.scene.room);
  const updateRoom = usePlanner((s) => s.updateRoom);
  const set = (id: string, patch: Partial<Alcove>, key?: string) =>
    updateRoom({ alcoves: room.alcoves.map((a) => (a.id === id ? { ...a, ...patch } : a)) }, key);
  const add = () => {
    const wall: WallSide = "south";
    const len = wallLength(room, wall);
    const width = Math.min(150, len);
    updateRoom({ alcoves: [...room.alcoves, { id: nanoid(8), wall, offset: (len - width) / 2, width, depth: 60, window: null }] });
  };

  return (
    <Section
      title="Alcoves"
      action={
        <button type="button" onClick={add} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
          <Plus className="size-3" /> Alcove
        </button>
      }
    >
      {room.alcoves.length === 0 ? (
        <p className="text-[12px] text-stone-500">Add a recess such as a desk nook or bay that extends the room through a wall.</p>
      ) : (
        room.alcoves.map((a, i) => {
          const along = a.wall === "north" || a.wall === "south";
          return (
            <div key={a.id} className="space-y-2.5 rounded-lg p-3 ring-1 ring-stone-200/80">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-stone-700">Alcove {room.alcoves.length > 1 ? i + 1 : ""}</span>
                <button
                  type="button"
                  onClick={() => updateRoom({ alcoves: room.alcoves.filter((x) => x.id !== a.id) })}
                  aria-label="Remove alcove"
                  className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <FieldRow label="Wall">
                <Segmented size="sm" ariaLabel="Alcove wall" value={a.wall} onChange={(wall) => set(a.id, { wall })} options={WALL_OPTIONS} />
              </FieldRow>
              <FieldRow label={along ? "From west corner" : "From north corner"}>
                <LengthField label="Alcove offset" unit={unit} value={a.offset} min={0} max={wallLength(room, a.wall)} onCommit={(v) => set(a.id, { offset: v }, `al-off-${a.id}`)} />
              </FieldRow>
              <FieldRow label="Width">
                <LengthField label="Alcove width" unit={unit} value={a.width} min={30} max={wallLength(room, a.wall)} onCommit={(v) => set(a.id, { width: v }, `al-w-${a.id}`)} />
              </FieldRow>
              <FieldRow label="Depth">
                <LengthField label="Alcove depth" unit={unit} value={a.depth} min={10} max={400} onCommit={(v) => set(a.id, { depth: v }, `al-d-${a.id}`)} />
              </FieldRow>
              <FieldRow label="Back window">
                {a.window ? (
                  <LengthField label="Alcove window width" unit={unit} value={a.window.width} min={20} max={a.width} onCommit={(v) => set(a.id, { window: { ...a.window!, width: v } }, `al-win-${a.id}`)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => set(a.id, { window: { width: Math.min(80, a.width), height: 120, sill: 90 } })}
                    className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                  >
                    <Plus className="size-3" /> Add window
                  </button>
                )}
              </FieldRow>
              {a.window && (
                <button type="button" onClick={() => set(a.id, { window: null })} className="text-[12px] font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
                  Remove window
                </button>
              )}
            </div>
          );
        })
      )}
    </Section>
  );
}
