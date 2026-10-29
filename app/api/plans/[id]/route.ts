import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { isUuid, json, notFound, readPlanBody, unauthorized } from "@/lib/plans-api";

// Every query filters on user_id, so a plan id from another account behaves as missing.

export async function GET(_req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const [row] = await sql`SELECT id, name, scene, updated_at FROM plans WHERE id = ${id} AND user_id = ${userId}`;
  if (!row) return notFound();
  return json({ id: row.id, name: row.name, scene: row.scene, updatedAt: new Date(row.updated_at).toISOString() });
}

/** Update a plan's scene and/or name. */
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
      updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, name, updated_at`;
  if (!row) return notFound();
  return json({ id: row.id, name: row.name, updatedAt: new Date(row.updated_at).toISOString() });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const rows = await sql`DELETE FROM plans WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new Response(null, { status: 204 });
}
