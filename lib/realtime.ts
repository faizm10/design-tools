import "server-only";
import { createRealtime, pgParam, rawSql, type RealtimeServer } from "@neon/realtime/server";
import type { LivePlanRow, PresenceRow } from "./collab/types";

let instance: RealtimeServer<never> | undefined;

/** Live collaboration needs Realtime enabled on the Neon branch. Without it the app works as before. */
export function realtimeUrl(): string | null {
  return process.env.NEON_REALTIME_URL && process.env.NEON_REALTIME_SECRET ? process.env.NEON_REALTIME_URL : null;
}

/** Created on first use, like the DB and auth clients, so builds don't need the secret. */
export function getRealtime(): RealtimeServer<never> {
  if (!instance) {
    const secret = process.env.NEON_REALTIME_SECRET;
    const url = process.env.DATABASE_URL;
    if (!secret || !url) throw new Error("NEON_REALTIME_SECRET and DATABASE_URL must be set. See .env.example.");
    // The database name is the connection string's path.
    instance = createRealtime({ secret, db: decodeURIComponent(new URL(url).pathname.slice(1)), debugMode: process.env.NODE_ENV === "development" });
  }
  return instance;
}

const uuid = (v: string) => pgParam.text("uuid", v);

// Access is part of each live query, so removing a collaborator cuts them off immediately.
const CAN_ACCESS = `(p.user_id = $2 OR EXISTS (SELECT 1 FROM plan_members a WHERE a.plan_id = p.id AND a.user_id = $2))`;

/** The plan's scene and sharing state. One row, or none once access is lost. */
export function livePlanQuery(planId: string, userId: string) {
  return rawSql<LivePlanRow>(
    `SELECT p.id, p.name, p.scene, p.version, p.user_id AS owner_id,
       COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS owner_name,
       (SELECT count(*) FROM plan_members m WHERE m.plan_id = p.id)::int AS member_count
     FROM plans p JOIN neon_auth."user" u ON u.id = p.user_id
     WHERE p.id = $1 AND ${CAN_ACCESS}`,
    [uuid(planId), uuid(userId)],
  );
}

/** Every open tab on the plan. Clients drop rows that stopped sending heartbeats. */
export function livePresenceQuery(planId: string, userId: string) {
  return rawSql<PresenceRow>(
    `SELECT pr.session_id, pr.user_id, pr.name, pr.color, pr.view, pr.cursor_x, pr.cursor_z, pr.selection, pr.updated_at
     FROM plan_presence pr JOIN plans p ON p.id = pr.plan_id
     WHERE pr.plan_id = $1 AND ${CAN_ACCESS}`,
    [uuid(planId), uuid(userId)],
  );
}
