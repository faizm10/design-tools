import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { json, MAX_MEMBERS_PER_PLAN } from "@/lib/plans-api";

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Accept an invite link: the signed-in user joins the plan as an editor. */
export async function POST(_req: Request, ctx: RouteContext<"/api/invites/[token]">) {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Sign in to join this plan." }, 401);
  const { token } = await ctx.params;
  const invalid = json({ error: "This invite link is no longer valid. Ask the owner for a new one." }, 404);
  if (!TOKEN.test(token)) return invalid;
  const [plan] = await sql`
    SELECT p.id, p.name, p.user_id = ${userId} AS owned,
           (SELECT count(*) FROM plan_members m WHERE m.plan_id = p.id)::int AS members,
           EXISTS (SELECT 1 FROM plan_members m WHERE m.plan_id = p.id AND m.user_id = ${userId}) AS joined
    FROM plan_invites i JOIN plans p ON p.id = i.plan_id
    WHERE i.token = ${token}`;
  if (!plan) return invalid;
  if (!plan.owned && !plan.joined) {
    if (plan.members >= MAX_MEMBERS_PER_PLAN) return json({ error: `This plan already has ${MAX_MEMBERS_PER_PLAN} collaborators.` }, 409);
    await sql`INSERT INTO plan_members (plan_id, user_id) VALUES (${plan.id}, ${userId}) ON CONFLICT DO NOTHING`;
  }
  return json({ planId: plan.id, name: plan.name });
}
