"use client";

import { useEffect, useState } from "react";
import { FolderOpen, LogOut, Trash2, Users } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { usePlanner } from "@/lib/store";
import { formatLength } from "@/lib/units";
import type { PlanSummary } from "@/lib/plans-types";
import { Modal } from "./Modal";

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (diff < 60) return "just now";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString();
}

export function PlansDialog() {
  const close = useCloud((s) => s.closeDialog);
  const { listPlans, openPlan, deletePlan, leavePlan } = useCloud.getState();
  const currentId = useCloud((s) => s.planId);
  const unit = usePlanner((s) => s.unit);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listPlans().then((p) => {
      if (!live) return;
      if (p) setPlans(p);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [listPlans]);

  return (
    <Modal title="My plans" onClose={close} width="max-w-md">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-[16px] font-semibold text-stone-900">My plans</h2>
        <p className="mt-1 text-[12.5px] text-stone-500">Your plans and ones shared with you. Opening a plan replaces the room on screen; you can undo it.</p>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-3 pb-4">
        {plans === null && !failed && (
          <div className="space-y-2 px-3 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-stone-100" />
            ))}
          </div>
        )}
        {failed && <p className="px-3 py-8 text-center text-[13px] text-stone-500">Your plans couldn’t be loaded. Close this and try again.</p>}
        {plans?.length === 0 && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-3 rounded-full bg-stone-100 p-3">
              <FolderOpen className="size-5 text-stone-400" />
            </div>
            <p className="text-[13px] font-medium text-stone-700">No saved plans yet</p>
            <p className="mt-1 text-[12px] text-stone-500">Press Save (⌘S) to store the room you’re working on.</p>
          </div>
        )}
        <ul className="space-y-1">
          {plans?.map((p) => (
            <li key={p.id} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-stone-50">
              <button type="button" disabled={!!busy} onClick={() => { setBusy(p.id); void openPlan(p.id).finally(() => setBusy(null)); }} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-stone-900">{p.name}</span>
                  {p.id === currentId && <span className="shrink-0 rounded-full bg-stone-900 px-1.5 py-px text-[10px] font-medium text-white">Open</span>}
                  {!p.owned && <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-700 ring-1 ring-sky-100">Shared by {p.ownerName}</span>}
                  {p.owned && p.members > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] font-medium text-stone-500" title={`Shared with ${p.members} ${p.members === 1 ? "person" : "people"}`}>
                      <Users className="size-3" /> {p.members}
                    </span>
                  )}
                  {busy === p.id && <span className="size-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />}
                </span>
                <span className="block text-[11.5px] text-stone-500 tabular-nums">
                  {formatLength(p.width, unit)} × {formatLength(p.length, unit)} · {p.items} {p.items === 1 ? "item" : "items"} · {relativeTime(p.updatedAt)}
                </span>
              </button>
              {confirming === p.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-2 py-1 text-[12px] font-medium text-stone-600 hover:bg-stone-100">
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await (p.owned ? deletePlan(p.id) : leavePlan(p.id))) setPlans((list) => list?.filter((x) => x.id !== p.id) ?? null);
                      setConfirming(null);
                    }}
                    className="rounded-md bg-red-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-red-700"
                  >
                    {p.owned ? "Delete" : "Leave"}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(p.id)}
                  aria-label={p.owned ? `Delete ${p.name}` : `Leave ${p.name}`}
                  title={p.owned ? "Delete" : "Leave this shared plan"}
                  className="shrink-0 rounded-md p-1.5 text-stone-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
                >
                  {p.owned ? <Trash2 className="size-4" /> : <LogOut className="size-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
