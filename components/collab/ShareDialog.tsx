"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, RefreshCw, UserMinus } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { useCollab } from "@/lib/collab/session";
import { colorFor, type Member } from "@/lib/collab/types";
import { toast } from "@/lib/toast";
import { Modal } from "../account/Modal";

async function call<T>(path: string, method = "GET"): Promise<T | null> {
  try {
    const res = await fetch(path, { method });
    if (res.status === 204) return {} as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(body.error ?? "Something went wrong. Try again.", { tone: "error" });
      return null;
    }
    return body as T;
  } catch {
    toast("Couldn’t reach the server. Check your connection.", { tone: "error" });
    return null;
  }
}

export function Avatar({ name, userId, size = 28 }: { name: string; userId: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{ backgroundColor: colorFor(userId), width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** Invite people to the open plan with a link, and see or remove who has access. */
export function ShareDialog() {
  const close = useCloud((s) => s.closeDialog);
  const planId = useCloud((s) => s.planId)!;
  const planName = useCloud((s) => s.planName);
  const me = useCloud((s) => s.user)!;
  const status = useCollab((s) => s.status);
  const online = useCollab((s) => s.peers);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const owner = members?.find((m) => m.owner);
  const isOwner = owner ? owner.userId === me.id : false;
  const link = token ? `${window.location.origin}/?join=${token}` : null;

  useEffect(() => {
    let live = true;
    void call<{ members: Member[] }>(`/api/plans/${planId}/members`).then((res) => live && res && setMembers(res.members));
    return () => {
      live = false;
    };
  }, [planId]);

  useEffect(() => {
    if (!isOwner) return;
    void call<{ token: string | null }>(`/api/plans/${planId}/invite`).then((r) => r && setToken(r.token));
  }, [isOwner, planId]);

  const makeLink = async () => {
    setBusy(true);
    const r = await call<{ token: string }>(`/api/plans/${planId}/invite`, "POST");
    setBusy(false);
    if (r) {
      setToken(r.token);
      if (token) toast("Made a new link. The old one no longer works.");
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Couldn’t copy. Select the link and copy it yourself.", { tone: "error" });
    }
  };

  const remove = async (m: Member) => {
    if (await call(`/api/plans/${planId}/members/${m.userId}`, "DELETE")) {
      setMembers((list) => list?.filter((x) => x.userId !== m.userId) ?? null);
      toast(`${m.name} no longer has access`);
    }
  };

  const leave = async () => {
    if (await useCloud.getState().leavePlan(planId)) {
      close();
      toast("You left the plan. Your copy stays on screen.");
    }
  };

  const onlineIds = new Set(online.map((p) => p.user_id));

  return (
    <Modal title="Share plan" onClose={close} width="max-w-md">
      <div className="px-6 pt-6">
        <h2 className="pr-6 text-[16px] font-semibold text-stone-900">Share “{planName ?? "this plan"}”</h2>
        <p className="mt-1 text-[12.5px] text-stone-500">
          {status === "off"
            ? "Collaborators can open and edit this plan, but live updates aren’t enabled on this server, so changes appear after each Save."
            : "Everyone with access edits the same plan live and sees each other’s cursors."}
        </p>
      </div>

      {isOwner && (
        <div className="mx-6 mt-4 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-stone-700">
            <Link2 className="size-4 text-stone-400" /> Invite link
          </div>
          {token === undefined ? (
            <div className="mt-2 h-8 animate-pulse rounded-md bg-stone-200/60" />
          ) : link ? (
            <>
              <div className="mt-2 flex gap-1.5">
                <input
                  readOnly
                  value={link}
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-8 min-w-0 flex-1 rounded-md bg-white px-2 text-[12px] text-stone-700 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-900/15"
                />
                <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1 rounded-md bg-stone-900 px-2.5 text-[12px] font-medium text-white hover:bg-stone-700">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-stone-500">Anyone with this link can sign in and edit the plan.</p>
              <div className="mt-1.5 flex gap-3">
                <button type="button" disabled={busy} onClick={makeLink} className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 hover:text-stone-800">
                  <RefreshCw className="size-3" /> Reset link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (await call(`/api/plans/${planId}/invite`, "DELETE")) setToken(null);
                  }}
                  className="text-[12px] font-medium text-stone-500 hover:text-red-600"
                >
                  Turn off link
                </button>
              </div>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={makeLink} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-stone-900 px-3 text-[12.5px] font-medium text-white hover:bg-stone-700 disabled:opacity-60">
              <Link2 className="size-3.5" /> Create invite link
            </button>
          )}
        </div>
      )}

      <div className="px-6 pt-5 pb-6">
        <div className="mb-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">People with access</div>
        {members === null ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100" />
            ))}
          </div>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <span className="relative">
                  <Avatar name={m.name} userId={m.userId} />
                  {onlineIds.has(m.userId) && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="Here now" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-stone-800">
                    {m.name} {m.userId === me.id && <span className="font-normal text-stone-400">(you)</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-stone-500">{m.email}</span>
                </span>
                {m.owner ? (
                  <span className="text-[11.5px] text-stone-400">Owner</span>
                ) : isOwner ? (
                  <button type="button" onClick={() => remove(m)} aria-label={`Remove ${m.name}`} title="Remove access" className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600">
                    <UserMinus className="size-4" />
                  </button>
                ) : m.userId === me.id ? (
                  <button type="button" onClick={leave} className="rounded-md px-2 py-1 text-[12px] font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-red-50 hover:text-red-700">
                    Leave
                  </button>
                ) : (
                  <span className="text-[11.5px] text-stone-400">Editor</span>
                )}
              </li>
            ))}
            {members.length === 1 && isOwner && <li className="px-2 py-2 text-[12px] text-stone-500">Only you so far. Send someone the invite link.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}
