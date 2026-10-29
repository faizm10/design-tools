"use client";

import { useCollab } from "@/lib/collab/session";
import type { PresenceRow } from "@/lib/collab/types";
import type { FurnitureItem, Space } from "@/lib/types";

type Camera = { s: number; tx: number; ty: number };

const hasCursor = (p: PresenceRow): p is PresenceRow & { cursor_x: number; cursor_z: number } => p.cursor_x !== null && p.cursor_z !== null;

/**
 * Other people's pointers over the 2D plan. Positions are in plan
 * centimetres, so they line up whatever each person's zoom or view; a short
 * transition smooths the ~80 ms steps between updates.
 */
export function PlanCursors({ cam }: { cam: Camera }) {
  const peers = useCollab((s) => s.peers);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {peers.filter(hasCursor).map((p) => (
        <div
          key={p.session_id}
          className="absolute top-0 left-0 transition-transform duration-100 ease-linear will-change-transform"
          style={{ transform: `translate(${cam.tx + p.cursor_x * cam.s}px, ${cam.ty + p.cursor_z * cam.s}px)` }}
        >
          <CursorArrow color={p.color} />
          <span
            className="absolute top-4 left-3.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-md"
            style={{ backgroundColor: p.color }}
          >
            {p.name}
            {p.view === "3d" && <span className="ml-1 font-medium opacity-80">· 3D</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CursorArrow({ color }: { color: string }) {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" className="-translate-x-[2px] -translate-y-[2px] drop-shadow">
      <path d="M2 2 L2 16.5 L6 12.8 L8.7 18.5 L11.3 17.3 L8.7 11.7 L14 11.7 Z" fill={color} stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Outlines, in each person's colour, around what they have selected. Drawn inside the plan's camera group. */
export function PeerSelections({ furniture, spaces, px }: { furniture: FurnitureItem[]; spaces: Space[]; px: number }) {
  const peers = useCollab((s) => s.peers);
  return (
    <g pointerEvents="none">
      {peers.map((p) => {
        const sel = p.selection;
        if (!sel) return null;
        let box: { x: number; z: number; w: number; d: number; rot: number } | null = null;
        if (sel.kind === "furniture") {
          const it = furniture.find((f) => f.id === sel.id);
          if (it) box = { x: it.x, z: it.z, w: it.width, d: it.depth, rot: it.rotation };
        } else if (sel.kind === "space") {
          const sp = spaces.find((s) => s.id === sel.id);
          if (sp) box = { x: sp.x + sp.width / 2, z: sp.z + sp.length / 2, w: sp.width, d: sp.length, rot: 0 };
        }
        if (!box) return null;
        const pad = 4 * px;
        return (
          <g key={p.session_id} transform={`translate(${box.x} ${box.z}) rotate(${box.rot})`}>
            <rect
              x={-box.w / 2 - pad}
              y={-box.d / 2 - pad}
              width={box.w + pad * 2}
              height={box.d + pad * 2}
              rx={3 * px}
              fill={p.color}
              fillOpacity={0.06}
              stroke={p.color}
              strokeWidth={2 * px}
            />
            <g transform={`translate(${-box.w / 2 - pad} ${-box.d / 2 - pad})`}>
              <rect y={-15 * px} width={(p.name.length * 6.2 + 12) * px} height={14 * px} rx={3 * px} fill={p.color} />
              <text x={6 * px} y={-5 * px} fontSize={10 * px} fontWeight={600} fill="#ffffff">
                {p.name}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
