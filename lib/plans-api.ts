import "server-only";
import { validateScene } from "./scene";
import type { Scene } from "./types";

export type { PlanSummary } from "./plans-types";

export const MAX_SCENE_BYTES = 512 * 1024;
export const MAX_PLANS_PER_USER = 200;

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const unauthorized = () => json({ error: "Sign in to save plans." }, 401);
export const notFound = () => json({ error: "Plan not found." }, 404);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID.test(id);

/** Parse and validate a { name?, scene? } request body. */
export async function readPlanBody(req: Request, requireScene: boolean): Promise<{ name?: string; scene?: Scene } | { error: string }> {
  const text = await req.text();
  if (text.length > MAX_SCENE_BYTES) return { error: "This plan is too large to save." };
  let body: { name?: unknown; scene?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Request body must be JSON." };
  }
  const out: { name?: string; scene?: Scene } = {};
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
