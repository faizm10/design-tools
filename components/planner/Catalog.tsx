"use client";

import { useMemo, useState } from "react";
import { Search, X, PackageSearch, Plus } from "lucide-react";
import { CATALOG, CATEGORIES, type CatalogCategory, type CatalogEntry } from "@/lib/catalog";
import { usePlanner } from "@/lib/store";
import { formatDims } from "@/lib/units";
import { PlanSymbol } from "../plan2d/PlanSymbol";

export const DRAG_MIME = "application/x-bedroom-planner-item";

export function Thumbnail({ entry, size = 64 }: { entry: Pick<CatalogEntry, "type" | "width" | "depth" | "color">; size?: number }) {
  const pad = Math.max(entry.width, entry.depth) * 0.08;
  const box = Math.max(entry.width, entry.depth) + pad * 2;
  return (
    <svg viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} width={size} height={size} aria-hidden>
      <PlanSymbol type={entry.type} w={entry.width} d={entry.depth} color={entry.color} px={box / size} />
    </svg>
  );
}

export function Catalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategory | "All">("All");
  const unit = usePlanner((s) => s.unit);
  const addFurniture = usePlanner((s) => s.addFurniture);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(
      (c) =>
        (category === "All" || c.category === category) &&
        (!q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q))),
    );
  }, [query, category]);

  const grouped = useMemo(() => {
    const m = new Map<CatalogCategory, CatalogEntry[]>();
    for (const r of results) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return CATEGORIES.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const);
  }, [results]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-stone-200/80 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-stone-900">Furniture</h2>
          <span className="text-[11px] text-stone-400">Drag into the room</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search beds, desks, lamps…"
            aria-label="Search furniture"
            className="h-9 w-full rounded-lg border border-stone-200 bg-stone-50 pr-8 pl-8 text-[13px] text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-900/5 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="-mx-1 flex flex-wrap gap-1">
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                category === c ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <div className="mb-3 rounded-full bg-stone-100 p-3">
              <PackageSearch className="size-5 text-stone-400" />
            </div>
            <p className="text-[13px] font-medium text-stone-700">No matches for “{query}”</p>
            <p className="mt-1 text-[12px] text-stone-500">Try “bed”, “storage” or “lamp”.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
              className="mt-4 rounded-md px-3 py-1.5 text-[12px] font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
            >
              Show all furniture
            </button>
          </div>
        ) : (
          grouped.map(([cat, items]) => (
            <div key={cat} className="mt-3">
              <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-stone-400 uppercase">{cat}</h3>
              <div className="grid grid-cols-2 gap-2">
                {items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, c.id);
                      e.dataTransfer.setData("text/plain", c.name);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addFurniture(c.id)}
                    title={`Drag into the room, or click to add ${c.name}`}
                    className="group relative flex cursor-grab flex-col items-center rounded-xl border border-stone-200/80 bg-white p-2 pt-3 text-center transition hover:-translate-y-px hover:border-stone-300 hover:shadow-md active:cursor-grabbing"
                  >
                    <span className="absolute top-1.5 right-1.5 rounded-md bg-stone-900 p-0.5 text-white opacity-0 transition group-hover:opacity-100">
                      <Plus className="size-3" />
                    </span>
                    <div className="flex h-16 items-center justify-center">
                      <Thumbnail entry={c} />
                    </div>
                    <div className="mt-1.5 w-full truncate text-[12px] leading-tight font-medium text-stone-800">{c.name}</div>
                    <div className="mt-0.5 text-[10.5px] text-stone-400 tabular-nums">{formatDims(c.width, c.depth, unit)}</div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
