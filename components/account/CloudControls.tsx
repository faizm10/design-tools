"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CloudUpload, Copy, FolderOpen, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { sceneHash, useCloud } from "@/lib/cloud";
import { usePlanner } from "@/lib/store";
import { toast } from "@/lib/toast";
import { AuthDialog } from "./AuthDialog";
import { PlansDialog } from "./PlansDialog";

/** Mirrors the Neon Auth session into the cloud store. */
function SessionSync() {
  const { data, isPending } = authClient.useSession();
  const setSession = useCloud((s) => s.setSession);
  const user = data?.user;
  useEffect(() => {
    setSession(user ? { id: user.id, email: user.email, name: user.name } : null, isPending);
  }, [user, isPending, setSession]);
  return null;
}

function AccountMenu() {
  const user = useCloud((s) => s.user)!;
  const { openDialog, save, detach } = useCloud.getState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-700 transition hover:bg-stone-100";
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title={user.email}
        className="flex size-8 items-center justify-center rounded-full bg-stone-200 text-[12.5px] font-semibold text-stone-700 ring-2 ring-white transition hover:bg-stone-300"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="animate-panel-in absolute top-10 right-0 z-40 w-60 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-stone-200">
          <div className="px-2.5 pt-1.5 pb-2">
            <div className="truncate text-[13px] font-medium text-stone-900">{user.name || "Signed in"}</div>
            <div className="truncate text-[11.5px] text-stone-500">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-stone-100" />
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); openDialog("plans"); }}>
            <FolderOpen className="size-4 text-stone-400" /> My plans
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); void save({ asCopy: true }); }}>
            <Copy className="size-4 text-stone-400" /> Save as a copy
          </button>
          <div className="my-1 h-px bg-stone-100" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={async () => {
              setOpen(false);
              await authClient.signOut();
              detach();
              toast("Signed out. Your room stays in this browser.");
            }}
          >
            <LogOut className="size-4 text-stone-400" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function CloudControls() {
  const user = useCloud((s) => s.user);
  const pending = useCloud((s) => s.sessionPending);
  const saving = useCloud((s) => s.saving);
  const planId = useCloud((s) => s.planId);
  const savedHash = useCloud((s) => s.savedHash);
  const dialog = useCloud((s) => s.dialog);
  const scene = usePlanner((s) => s.scene);
  const { save, openDialog } = useCloud.getState();
  const hash = useMemo(() => sceneHash(scene), [scene]);
  const upToDate = !!user && !!planId && hash === savedHash;

  // ⌘S / Ctrl+S saves from anywhere, including while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useCloud.getState().save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <SessionSync />
      {!pending && !user && (
        <button type="button" onClick={() => openDialog("auth")} className="hidden h-8 rounded-md px-2.5 text-[12.5px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:inline-flex md:items-center">
          Sign in
        </button>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        title={user ? (upToDate ? "All changes saved to your account" : "Save to your account (⌘S)") : "Save this plan to an account (⌘S)"}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-70"
      >
        {saving ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        ) : upToDate ? (
          <Check className="size-3.5 text-emerald-600" />
        ) : (
          <CloudUpload className="size-3.5" />
        )}
        <span className="hidden md:inline">{saving ? "Saving…" : upToDate ? "Saved" : "Save"}</span>
      </button>
      {user && <AccountMenu />}
      {dialog === "auth" && !user && <AuthDialog />}
      {dialog === "plans" && user && <PlansDialog />}
    </>
  );
}
