import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { json, MAX_PLANS_PER_USER, readPlanBody, unauthorized, type PlanSummary } from "@/lib/plans-api";

/** List the signed-in user's plans, newest first. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const rows = await sql`
    SELECT id, name, updated_at,
           (scene->'room'->>'width')::float AS width,
           (scene->'room'->>'length')::float AS length,
           jsonb_array_length(scene->'furniture') AS items
    FROM plans WHERE user_id = ${userId}
    ORDER BY updated_at DESC`;
  const plans: PlanSummary[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: new Date(r.updated_at).toISOString(),
    width: r.width,
    length: r.length,
    items: r.items,
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
    INSERT INTO plans (user_id, name, scene)
    SELECT ${userId}, ${name}, ${JSON.stringify(body.scene)}::jsonb
    WHERE (SELECT count(*) FROM plans WHERE user_id = ${userId}) < ${MAX_PLANS_PER_USER}
    RETURNING id, name, updated_at`;
  if (!row) return json({ error: `You can save up to ${MAX_PLANS_PER_USER} plans. Delete one to make room.` }, 409);
  return json({ id: row.id, name: row.name, updatedAt: new Date(row.updated_at).toISOString() }, 201);
}
