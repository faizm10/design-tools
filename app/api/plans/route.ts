import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { json, MAX_PLANS_PER_USER, readPlanBody, unauthorized, type PlanSummary } from "@/lib/plans-api";

/** List the plans the signed-in user owns or collaborates on, newest first. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const rows = await sql`
    SELECT p.id, p.name, p.updated_at,
           (p.scene->'room'->>'width')::float AS width,
           (p.scene->'room'->>'length')::float AS length,
           jsonb_array_length(p.scene->'furniture') AS items,
           p.user_id = ${userId} AS owned,
           COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS owner_name,
           (SELECT count(*) FROM plan_members m WHERE m.plan_id = p.id)::int AS members
    FROM plans p JOIN neon_auth."user" u ON u.id = p.user_id
    WHERE p.user_id = ${userId}
       OR EXISTS (SELECT 1 FROM plan_members m WHERE m.plan_id = p.id AND m.user_id = ${userId})
    ORDER BY p.updated_at DESC`;
  const plans: PlanSummary[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: new Date(r.updated_at).toISOString(),
    width: r.width,
    length: r.length,
    items: r.items,
    owned: r.owned,
    ownerName: r.owner_name,
    members: r.members,
  }));
  return json({ plans });
}

/** Save a new plan. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const body = await readPlanBody(req, true);
  if ("error" in body) return json(body, 400);
  const name = body.name ?? body.scene!.room.name;
  const [row] = await sql`
    INSERT INTO plans (user_id, name, scene, updated_by)
    SELECT ${userId}, ${name}, ${JSON.stringify(body.scene)}::jsonb, ${userId}
    WHERE (SELECT count(*) FROM plans WHERE user_id = ${userId}) < ${MAX_PLANS_PER_USER}
    RETURNING id, name, version, updated_at`;
  if (!row) return json({ error: `You can save up to ${MAX_PLANS_PER_USER} plans. Delete one to make room.` }, 409);
  return json({ id: row.id, name: row.name, version: row.version, updatedAt: new Date(row.updated_at).toISOString() }, 201);
}
