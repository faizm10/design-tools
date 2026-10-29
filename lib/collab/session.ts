import { create } from "zustand";
import { usePlanner } from "../store";
import { validateScene } from "../scene";
import type { Scene } from "../types";
import { deepEqual, mergeScenes } from "./merge";
import type { LivePlanRow, PresenceRow } from "./types";

/** Peers that haven't sent a heartbeat for this long are treated as gone. */
export const PRESENCE_TIMEOUT_MS = 40_000;
const HEARTBEAT_MS = 15_000;
const CURSOR_INTERVAL_MS = 80;
const PUSH_DELAY_MS = 250;

/** Identifies this tab, so the same person in two tabs shows as two cursors. */
export const SESSION_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export type CollabStatus = "off" | "connecting" | "live" | "offline" | "error";

interface CollabState {
  planId: string | null;
  status: CollabStatus;
  /** Shared with at least one other person, or opened by a collaborator. */
  shared: boolean;
  owned: boolean;
  ownerName: string;
  /** Other tabs on this plan, freshest first. */
  peers: PresenceRow[];
  /** Why live updates stopped, when status is "error". */
  error: string | null;
}

export const useCollab = create<CollabState>()(() => ({
  planId: null,
  status: "off",
  shared: false,
  owned: true,
  ownerName: "",
  peers: [],
  error: null,
}));

async function send(path: string, body: unknown, method = "PUT") {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

/**
 * Keeps the local scene and the shared plan in step while a plan is open.
 *
 * `base` is the last version both sides agreed on. Local edits are pushed
 * with that version; if someone else saved first the server answers 409 and
 * the two are merged (see mergeScenes) and pushed again. Remote changes
 * arrive through the live query and are merged in the same way.
 */
export function createPlanSync(
  planId: string,
  opts: {
    /** Record that `scene` is what the server has (drives the Save button's "Saved" state). */
    onSaved: (scene: Scene) => void;
    /** Whether `scene` is exactly what was last opened or saved, i.e. has no unsaved edits. */
    isPristine: (scene: Scene) => boolean;
  },
) {
  const { onSaved } = opts;
  let base: Scene | null = null;
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight = false;
  let again = false;
  let stopped = false;
  let applying = false;

  const isShared = () => useCollab.getState().shared;

  function apply(scene: Scene) {
    applying = true;
    try {
      usePlanner.getState().applyRemote(scene);
    } finally {
      applying = false;
    }
  }

  /** Bring in a newer copy of the plan from the server. */
  function receive(remote: Scene, remoteVersion: number) {
    if (base && remoteVersion <= version) return; // our own write echoing back, or an old one
    const local = usePlanner.getState().scene;
    let merged: Scene;
    if (base) merged = mergeScenes(base, local, remote);
    // First sight of the plan. Unsaved local edits survive: a plan nobody else is in
    // keeps its manual Save, and in a shared one they are sent on top.
    else if (!isShared() || !opts.isPristine(local)) merged = local;
    else merged = remote;
    base = remote;
    version = remoteVersion;
    if (!deepEqual(merged, local)) apply(merged);
    if (deepEqual(merged, remote)) onSaved(remote);
    else if (isShared()) schedule();
  }

  async function push() {
    if (stopped || !base || !isShared()) return;
    if (inflight) {
      again = true;
      return;
    }
    const scene = usePlanner.getState().scene;
    if (deepEqual(scene, base)) return;
    inflight = true;
    try {
      const res = await send(`/api/plans/${planId}`, { scene, baseVersion: version });
      if (stopped) return;
      if (res.status === 200) {
        base = scene;
        version = res.data.version;
        onSaved(scene);
      } else if (res.status === 409 && res.data?.current) {
        const remote = validateScene(res.data.current.scene);
        if (remote) receive(remote, res.data.current.version);
        again = true;
      } else if (res.status === 401 || res.status === 404) {
        useCollab.setState({ status: "error", error: res.status === 401 ? "You were signed out." : "You no longer have access to this plan." });
        stopped = true;
      } else {
        useCollab.setState({ status: "offline" });
        timer = setTimeout(push, 2000);
      }
    } catch {
      useCollab.setState({ status: "offline" });
      if (!stopped) timer = setTimeout(push, 2000);
    } finally {
      inflight = false;
      if (again && !stopped) {
        again = false;
        schedule();
      }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(push, PUSH_DELAY_MS);
  }

  const unsubscribe = usePlanner.subscribe((s, prev) => {
    if (s.scene !== prev.scene && !applying) schedule();
  });

  return {
    /** Called with each result of the live plan query. */
    onRow(row: LivePlanRow | undefined) {
      if (!row) {
        useCollab.setState({ status: "error", error: "You no longer have access to this plan." });
        return;
      }
      const ownerId = row.owner_id;
      const wasShared = isShared();
      useCollab.setState({ shared: row.member_count > 0, ownerName: row.owner_name, owned: ownerId === currentUserId() });
      const remote = validateScene(row.scene);
      if (remote) receive(remote, row.version);
      // Sharing just started: send anything not yet saved.
      if (!wasShared && isShared()) schedule();
    },
    /** Push now and resolve once the local scene is saved (used by the Save button). */
    async flush() {
      clearTimeout(timer);
      await push();
      return !!base && deepEqual(usePlanner.getState().scene, base);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
    },
  };
}

// Set by CollabSession from the cloud store, so this module doesn't import it (and create a cycle).
let userIdGetter: () => string | null = () => null;
export const setUserIdGetter = (fn: () => string | null) => {
  userIdGetter = fn;
};
const currentUserId = () => userIdGetter();

/**
 * Reports this tab's cursor, view and selection. Cursor moves are sent at
 * most every 80 ms; a heartbeat keeps the row fresh while idle.
 */
export function createPresenceSender(planId: string) {
  let cursor: { x: number; z: number } | null = null;
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let inflight = false;

  const payload = () => {
    const st = usePlanner.getState();
    return { sessionId: SESSION_ID, view: st.view, x: cursor?.x ?? null, z: cursor?.z ?? null, selection: st.selection };
  };

  async function flush() {
    clearTimeout(timer);
    if (stopped || !useCollab.getState().shared) {
      timer = setTimeout(flush, HEARTBEAT_MS);
      return;
    }
    if (inflight) {
      timer = setTimeout(flush, CURSOR_INTERVAL_MS);
      return;
    }
    inflight = true;
    lastSent = Date.now();
    try {
      await send(`/api/plans/${planId}/presence`, payload(), "POST");
    } catch {
      // Presence is best effort; the next move or heartbeat tries again.
    } finally {
      inflight = false;
    }
    if (!stopped) timer = setTimeout(flush, HEARTBEAT_MS);
  }

  /** Send soon, but no more often than CURSOR_INTERVAL_MS. */
  function nudge() {
    if (stopped) return;
    const wait = Math.max(0, CURSOR_INTERVAL_MS - (Date.now() - lastSent));
    clearTimeout(timer);
    timer = setTimeout(flush, wait);
  }

  const unsubscribe = usePlanner.subscribe((s, prev) => {
    if (s.selection !== prev.selection || s.view !== prev.view) nudge();
  });

  const leave = () => {
    const body = JSON.stringify({ sessionId: SESSION_ID, leave: true });
    navigator.sendBeacon?.(`/api/plans/${planId}/presence`, new Blob([body], { type: "application/json" }));
  };
  window.addEventListener("pagehide", leave);
  nudge();

  return {
    setCursor(p: { x: number; z: number } | null) {
      if (p === cursor || (p && cursor && Math.abs(p.x - cursor.x) < 0.5 && Math.abs(p.z - cursor.z) < 0.5)) return;
      cursor = p;
      nudge();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("pagehide", leave);
      leave();
    },
  };
}

/** The live plan sync, if any, so the Save button can save through it while a plan is shared. */
export const syncBridge: { flush: (() => Promise<boolean>) | null } = { flush: null };

/** The live presence sender, if any, so views can report the cursor without prop drilling. */
export const presenceBridge: { setCursor: ((p: { x: number; z: number } | null) => void) | null } = { setCursor: null };
