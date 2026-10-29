import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { isUuid, json, notFound, planRole, readPlanBody, unauthorized } from "@/lib/plans-api";

// Owners and collaborators can open and edit a plan; only its owner can delete it.
// A plan the user has no access to behaves as missing.

const ACCESS = (userId: string) => sql`(user_id = ${userId} OR EXISTS (SELECT 1 FROM plan_members m WHERE m.plan_id = plans.id AND m.user_id = ${userId}))`;

export async function GET(_req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const [row] = await sql`SELECT id, name, scene, version, user_id = ${userId} AS owned, updated_at FROM plans WHERE id = ${id} AND ${ACCESS(userId)}`;
  if (!row) return notFound();
  return json({ id: row.id, name: row.name, scene: row.scene, version: row.version, owned: row.owned, updatedAt: new Date(row.updated_at).toISOString() });
}

/**
 * Update a plan's scene and/or name. With `baseVersion`, the update only
 * applies if nobody else saved in between; otherwise it answers 409 with the
 * current plan so the client can merge and retry.
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const body = await readPlanBody(req, false);
  if ("error" in body) return json(body, 400);
  if (!body.name && !body.scene) return json({ error: "Nothing to update." }, 400);
  const [row] = await sql`
    UPDATE plans SET
      name = COALESCE(${body.name ?? null}, name),
      scene = COALESCE(${body.scene ? JSON.stringify(body.scene) : null}::jsonb, scene),
      version = version + 1,
      updated_by = ${userId},
      updated_at = now()
    WHERE id = ${id} AND ${ACCESS(userId)} AND (${body.baseVersion ?? null}::int IS NULL OR version = ${body.baseVersion ?? null}::int)
    RETURNING id, name, version, updated_at`;
  if (row) return json({ id: row.id, name: row.name, version: row.version, updatedAt: new Date(row.updated_at).toISOString() });
  const [current] = await sql`SELECT name, scene, version FROM plans WHERE id = ${id} AND ${ACCESS(userId)}`;
  if (!current) return notFound();
  return json({ error: "Someone else changed this plan.", current: { name: current.name, scene: current.scene, version: current.version } }, 409);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const rows = await sql`DELETE FROM plans WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  if (rows.length) return new Response(null, { status: 204 });
  if (await planRole(id, userId)) return json({ error: "Only the owner can delete a shared plan. You can leave it instead." }, 403);
  return notFound();
}
