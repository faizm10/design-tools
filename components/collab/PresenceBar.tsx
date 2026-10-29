"use client";

import { Users } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { useCollab } from "@/lib/collab/session";
import { Avatar } from "./ShareDialog";

const STATUS: Record<string, { dot: string; label: string }> = {
  live: { dot: "bg-emerald-500", label: "Live: changes sync instantly" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting to live updates…" },
  offline: { dot: "bg-amber-500", label: "Offline: changes will sync when you reconnect" },
  error: { dot: "bg-red-500", label: "Live updates stopped" },
};

/** Who else is here, the live-sync status, and the Share button. */
export function PresenceBar() {
  const user = useCloud((s) => s.user);
  const planId = useCloud((s) => s.planId);
  const status = useCollab((s) => s.status);
  const shared = useCollab((s) => s.shared);
  const error = useCollab((s) => s.error);
  const peers = useCollab((s) => s.peers);
  // One avatar per person, even with several tabs open.
  const people = [...new Map(peers.map((p) => [p.user_id, p])).values()];
  const shown = people.slice(0, 4);
  const st = shared ? STATUS[status] : undefined;

  const share = async () => {
    const cloud = useCloud.getState();
    if (!user) return cloud.openDialog("auth", true);
    // Sharing needs a saved plan to point the link at.
    if (!planId) await cloud.save();
    if (useCloud.getState().planId) cloud.openDialog("share");
  };

  return (
    <div className="flex items-center gap-1.5">
      {shown.length > 0 && (
        <div className="flex -space-x-1.5" aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} here`}>
          {shown.map((p) => (
            <span key={p.user_id} title={`${p.name}${p.view === "3d" ? " · in 3D" : ""}`}>
              <Avatar name={p.name} userId={p.user_id} size={26} />
            </span>
          ))}
          {people.length > shown.length && (
            <span className="flex size-[26px] items-center justify-center rounded-full bg-stone-200 text-[10.5px] font-semibold text-stone-600 ring-2 ring-white">+{people.length - shown.length}</span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={share}
        title={st ? (status === "error" && error ? `${st.label}: ${error}` : st.label) : "Invite people to edit this plan with you"}
        className="relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
      >
        <Users className="size-3.5" />
        <span className="hidden md:inline">Share</span>
        {st && <span className={`absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white ${st.dot}`} />}
      </button>
    </div>
  );
}
