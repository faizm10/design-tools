import { currentUser } from "@/lib/auth/server";
import { colorFor } from "@/lib/collab/types";
import { sql } from "@/lib/db";
import { isUuid, json, notFound, unauthorized } from "@/lib/plans-api";

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const SELECTION_KINDS = ["furniture", "opening", "alcove", "space", "wall"];
const WALLS = ["north", "east", "south", "west"];

/** Only well-formed selections are stored; anything else is dropped to null. */
function readSelection(v: unknown) {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (!SELECTION_KINDS.includes(s.kind as string)) return null;
  if (s.kind === "wall") return WALLS.includes(s.wall as string) ? { kind: "wall", wall: s.wall } : null;
  return typeof s.id === "string" && s.id.length <= 64 ? { kind: s.kind, id: s.id } : null;
}

const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e5 ? Math.round(v * 10) / 10 : null);

/**
 * Report this tab's cursor, view and selection, or `{ leave: true }` when it
 * closes (sent with navigator.sendBeacon, which can only POST).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/plans/[id]/presence">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sessionId = body?.sessionId;
  if (typeof sessionId !== "string" || !SESSION.test(sessionId)) return json({ error: "sessionId is required." }, 400);

  if (body!.leave) {
    await sql`DELETE FROM plan_presence WHERE plan_id = ${id} AND session_id = ${sessionId} AND user_id = ${user.id}`;
    return new Response(null, { status: 204 });
  }

  const view = body!.view === "3d" ? "3d" : "2d";
  const selection = readSelection(body!.selection);
  // Upsert only for people with access, and never over another user's session.
  const rows = await sql`
    INSERT INTO plan_presence (plan_id, session_id, user_id, name, color, view, cursor_x, cursor_z, selection, updated_at)
    SELECT p.id, ${sessionId}, ${user.id}, ${user.name.slice(0, 60)}, ${colorFor(user.id)}, ${view},
           ${coord(body!.x)}, ${coord(body!.z)}, ${selection ? JSON.stringify(selection) : null}::jsonb, now()
    FROM plans p
    WHERE p.id = ${id}
      AND (p.user_id = ${user.id} OR EXISTS (SELECT 1 FROM plan_members m WHERE m.plan_id = p.id AND m.user_id = ${user.id}))
    ON CONFLICT (plan_id, session_id) DO UPDATE SET
      view = EXCLUDED.view, cursor_x = EXCLUDED.cursor_x, cursor_z = EXCLUDED.cursor_z,
      selection = EXCLUDED.selection, name = EXCLUDED.name, updated_at = now()
    WHERE plan_presence.user_id = EXCLUDED.user_id
    RETURNING 1`;
  if (!rows.length) return notFound();
  // Tabs that closed without saying goodbye (crashes, lost connections) get swept up now and then.
  if (Math.random() < 0.05) await sql`DELETE FROM plan_presence WHERE plan_id = ${id} AND updated_at < now() - interval '2 minutes'`;
  return new Response(null, { status: 204 });
}
