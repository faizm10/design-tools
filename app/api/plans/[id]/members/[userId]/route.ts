import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { isUuid, json, notFound, planRole, unauthorized } from "@/lib/plans-api";

/** The owner removes a collaborator, or a collaborator leaves (removes themselves). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/plans/[id]/members/[userId]">) {
  const me = await currentUserId();
  if (!me) return unauthorized();
  const { id, userId } = await ctx.params;
  if (!isUuid(id) || !isUuid(userId)) return notFound();
  const role = await planRole(id, me);
  if (!role) return notFound();
  if (role !== "owner" && userId !== me) return json({ error: "Only the plan's owner can remove other people." }, 403);
  const rows = await sql`DELETE FROM plan_members WHERE plan_id = ${id} AND user_id = ${userId} RETURNING user_id`;
  if (!rows.length) return notFound();
  await sql`DELETE FROM plan_presence WHERE plan_id = ${id} AND user_id = ${userId}`;
  return new Response(null, { status: 204 });
}
