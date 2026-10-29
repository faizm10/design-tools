import { currentUserId } from "@/lib/auth/server";
import type { Member } from "@/lib/collab/types";
import { sql } from "@/lib/db";
import { isUuid, json, notFound, planRole, unauthorized } from "@/lib/plans-api";

/** Everyone with access to the plan, owner first. */
export async function GET(_req: Request, ctx: RouteContext<"/api/plans/[id]/members">) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await planRole(id, userId))) return notFound();
  const rows = await sql`
    SELECT u.id, COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS name, u.email, true AS owner, p.created_at AS since
    FROM plans p JOIN neon_auth."user" u ON u.id = p.user_id WHERE p.id = ${id}
    UNION ALL
    SELECT u.id, COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)), u.email, false, m.added_at
    FROM plan_members m JOIN neon_auth."user" u ON u.id = m.user_id WHERE m.plan_id = ${id}
    ORDER BY owner DESC, since`;
  const members: Member[] = rows.map((r) => ({ userId: r.id, name: r.name, email: r.email, owner: r.owner }));
  return json({ members });
}
