import { randomBytes } from "node:crypto";
import { currentUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { isUuid, json, notFound, planRole, unauthorized } from "@/lib/plans-api";

// The owner's invite link for a plan: read it, create or replace it, or turn it off.

async function ownerOnly(ctx: RouteContext<"/api/plans/[id]/invite">) {
  const userId = await currentUserId();
  if (!userId) return { error: unauthorized() };
  const { id } = await ctx.params;
  if (!isUuid(id)) return { error: notFound() };
  const role = await planRole(id, userId);
  if (!role) return { error: notFound() };
  if (role !== "owner") return { error: json({ error: "Only the plan's owner can manage its invite link." }, 403) };
  return { id };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/plans/[id]/invite">) {
  const r = await ownerOnly(ctx);
  if ("error" in r) return r.error;
  const [row] = await sql`SELECT token FROM plan_invites WHERE plan_id = ${r.id}`;
  return json({ token: row?.token ?? null });
}

/** Create the link, or replace it so the old one stops working. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plans/[id]/invite">) {
  const r = await ownerOnly(ctx);
  if ("error" in r) return r.error;
  const token = randomBytes(18).toString("base64url");
  const [row] = await sql`
    INSERT INTO plan_invites (plan_id, token) VALUES (${r.id}, ${token})
    ON CONFLICT (plan_id) DO UPDATE SET token = EXCLUDED.token, created_at = now()
    RETURNING token`;
  return json({ token: row.token }, 201);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plans/[id]/invite">) {
  const r = await ownerOnly(ctx);
  if ("error" in r) return r.error;
  await sql`DELETE FROM plan_invites WHERE plan_id = ${r.id}`;
  return new Response(null, { status: 204 });
}
