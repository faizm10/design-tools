import "server-only";
import { sql } from "./db";
import { validateScene } from "./scene";
import type { Scene } from "./types";

export type { PlanSummary } from "./plans-types";

export const MAX_SCENE_BYTES = 512 * 1024;
export const MAX_PLANS_PER_USER = 200;
export const MAX_MEMBERS_PER_PLAN = 20;

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const unauthorized = () => json({ error: "Sign in to save plans." }, 401);
export const notFound = () => json({ error: "Plan not found." }, 404);

/** How the user relates to a plan: its owner, a collaborator, or neither (treated as not found). */
export async function planRole(planId: string, userId: string): Promise<"owner" | "member" | null> {
  const [row] = await sql`
    SELECT p.user_id = ${userId} AS owner FROM plans p
    WHERE p.id = ${planId}
      AND (p.user_id = ${userId} OR EXISTS (SELECT 1 FROM plan_members m WHERE m.plan_id = p.id AND m.user_id = ${userId}))`;
  return row ? (row.owner ? "owner" : "member") : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID.test(id);

/** Parse and validate a { name?, scene?, baseVersion? } request body. */
export async function readPlanBody(req: Request, requireScene: boolean): Promise<{ name?: string; scene?: Scene; baseVersion?: number } | { error: string }> {
  const text = await req.text();
  if (text.length > MAX_SCENE_BYTES) return { error: "This plan is too large to save." };
  let body: { name?: unknown; scene?: unknown; baseVersion?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Request body must be JSON." };
  }
  const out: { name?: string; scene?: Scene; baseVersion?: number } = {};
  if (body.baseVersion !== undefined) {
    if (!Number.isInteger(body.baseVersion)) return { error: "baseVersion must be an integer." };
    out.baseVersion = body.baseVersion as number;
  }
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return { error: "Plan name can't be empty." };
    out.name = name;
  }
  if (body.scene !== undefined || requireScene) {
    const scene = validateScene(body.scene);
    if (!scene) return { error: "That doesn't look like a room plan." };
    out.scene = scene;
  }
  return out;
}
