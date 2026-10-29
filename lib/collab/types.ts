import type { Selection, ViewMode } from "../types";

// Row shapes of the live queries in lib/realtime.ts, shared by server and browser.

/** The plan itself, as every collaborator sees it. */
export interface LivePlanRow {
  id: string;
  name: string;
  /** Validated with validateScene before use. */
  scene: unknown;
  version: number;
  owner_id: string;
  owner_name: string;
  member_count: number;
}

/** One open browser tab on the plan. */
export interface PresenceRow {
  session_id: string;
  user_id: string;
  name: string;
  color: string;
  view: ViewMode;
  cursor_x: number | null;
  cursor_z: number | null;
  selection: Selection;
  updated_at: Date;
}

export type LiveQueryName = "plan" | "presence";

/** What POST /api/plans/[id]/live returns: the Realtime URL and a sealed query. */
export interface LiveQueryGrant<Row> {
  url: string;
  sealed: import("@neon/realtime/client").SealedLiveQuery<Row>;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  owner: boolean;
}

/** Presence colours, picked per user so a person keeps their colour across tabs. */
export const PEER_COLORS = ["#e5484d", "#0d74ce", "#2f9e44", "#ab4aba", "#e8590c", "#0c8599", "#d6409f", "#5f3dc4"];

export function colorFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return PEER_COLORS[Math.abs(h) % PEER_COLORS.length];
}
