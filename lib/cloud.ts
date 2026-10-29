import { create } from "zustand";
import { usePlanner } from "./store";
import { validateScene } from "./scene";
import { toast } from "./toast";
import type { PlanSummary } from "./plans-types";
import type { Scene } from "./types";

const CLOUD_KEY = "bedroom-planner:cloud";

export interface CloudUser {
  id: string;
  email: string;
  name: string;
}

interface Linked {
  planId: string | null;
  planName: string | null;
  /** Hash of the scene as last saved, to tell whether there are unsaved changes. */
  savedHash: string | null;
}

interface CloudState extends Linked {
  user: CloudUser | null;
  sessionPending: boolean;
  saving: boolean;
  dialog: null | "auth" | "plans";
  /** Save as soon as sign-in completes (set when Save was pressed while signed out). */
  saveAfterAuth: boolean;

  setSession: (user: CloudUser | null, pending: boolean) => void;
  openDialog: (d: CloudState["dialog"], saveAfterAuth?: boolean) => void;
  closeDialog: () => void;
  save: (opts?: { asCopy?: boolean }) => Promise<void>;
  openPlan: (id: string) => Promise<void>;
  deletePlan: (id: string) => Promise<boolean>;
  listPlans: () => Promise<PlanSummary[] | null>;
  /** Stop tracking a cloud plan, e.g. after loading a template or signing out. */
  detach: () => void;
}

/** FNV-1a over the serialized scene: cheap and stable enough for dirty checks. */
export function sceneHash(scene: Scene): string {
  const s = JSON.stringify(scene);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

function loadLinked(): Linked {
  const empty = { planId: null, planName: null, savedHash: null };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(CLOUD_KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

function storeLinked(l: Linked) {
  try {
    window.localStorage.setItem(CLOUD_KEY, JSON.stringify(l));
  } catch {
    // Storage unavailable: the link just won't survive a reload.
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: body.error ?? "Something went wrong. Try again." };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "Couldn’t reach the server. Check your connection." };
  }
}

export const useCloud = create<CloudState>()((set, get) => {
  const link = (l: Linked) => {
    set(l);
    storeLinked(l);
  };

  const onUnauthorized = () => {
    set({ user: null, dialog: "auth", saveAfterAuth: true });
  };

  return {
    ...loadLinked(),
    user: null,
    sessionPending: true,
    saving: false,
    dialog: null,
    saveAfterAuth: false,

    setSession: (user, pending) => {
      const prev = get().user;
      set({ user, sessionPending: pending });
      if (pending) return;
      // Signed out (or a different account): the linked plan isn't ours to update.
      if (!user && get().planId) get().detach();
      if (prev && user && prev.id !== user.id) get().detach();
      if (user && !prev) {
        const shouldSave = get().saveAfterAuth;
        if (get().dialog === "auth") set({ dialog: null, saveAfterAuth: false });
        if (shouldSave) void get().save();
      }
    },

    openDialog: (dialog, saveAfterAuth = false) => set({ dialog, saveAfterAuth }),
    closeDialog: () => set({ dialog: null, saveAfterAuth: false }),

    save: async ({ asCopy = false } = {}) => {
      const { user, planId, saving } = get();
      if (saving) return;
      if (!user) {
        get().openDialog("auth", true);
        return;
      }
      const scene = usePlanner.getState().scene;
      const hash = sceneHash(scene);
      set({ saving: true });
      let res = planId && !asCopy
        ? await api<{ id: string; name: string }>(`/api/plans/${planId}`, { method: "PUT", body: JSON.stringify({ scene }) })
        : null;
      // A plan deleted elsewhere gets saved as a new one.
      if (!res || (!res.ok && res.status === 404)) {
        const name = asCopy ? `${scene.room.name} (copy)` : scene.room.name;
        res = await api<{ id: string; name: string }>("/api/plans", { method: "POST", body: JSON.stringify({ name, scene }) });
      }
      set({ saving: false });
      if (!res.ok) {
        if (res.status === 401) onUnauthorized();
        else toast(res.error, { tone: "error" });
        return;
      }
      link({ planId: res.data.id, planName: res.data.name, savedHash: hash });
      toast(asCopy ? `Saved a copy as “${res.data.name}”` : `Saved “${res.data.name}” to your account`);
    },

    openPlan: async (id) => {
      const res = await api<{ id: string; name: string; scene: unknown }>(`/api/plans/${id}`);
      if (!res.ok) {
        if (res.status === 401) onUnauthorized();
        else toast(res.error, { tone: "error" });
        return;
      }
      const scene = validateScene(res.data.scene);
      if (!scene) {
        toast("That saved plan couldn’t be read.", { tone: "error" });
        return;
      }
      usePlanner.getState().loadScene(scene);
      link({ planId: res.data.id, planName: res.data.name, savedHash: sceneHash(scene) });
      set({ dialog: null });
      toast(`Opened “${res.data.name}”`, { action: { label: "Undo", run: () => usePlanner.getState().undo() } });
    },

    deletePlan: async (id) => {
      const res = await api<void>(`/api/plans/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        if (res.status === 401) onUnauthorized();
        else toast(res.error, { tone: "error" });
        return false;
      }
      if (get().planId === id) get().detach();
      return true;
    },

    listPlans: async () => {
      const res = await api<{ plans: PlanSummary[] }>("/api/plans");
      if (!res.ok) {
        if (res.status === 401) onUnauthorized();
        else toast(res.error, { tone: "error" });
        return null;
      }
      return res.data.plans;
    },

    detach: () => link({ planId: null, planName: null, savedHash: null }),
  };
});
