import { currentUserId } from "@/lib/auth/server";
import { isUuid, json, notFound, planRole, unauthorized } from "@/lib/plans-api";
import { getRealtime, livePlanQuery, livePresenceQuery, realtimeUrl } from "@/lib/realtime";

/**
 * Seal a live query on the plan for the signed-in user. The browser calls
 * this to subscribe, then again about once a minute to renew the
 * subscription (sealed queries are short-lived bearer tokens).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/plans/[id]/live">) {
  const url = realtimeUrl();
  if (!url) return json({ error: "Live collaboration isn't set up on this server." }, 503);
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await planRole(id, userId))) return notFound();
  const { query } = (await req.json().catch(() => ({}))) as { query?: unknown };
  const realtime = getRealtime();
  if (query === "plan") return json({ url, sealed: await realtime.seal({ query: livePlanQuery(id, userId) }) });
  if (query === "presence") return json({ url, sealed: await realtime.seal({ query: livePresenceQuery(id, userId) }) });
  return json({ error: "query must be \"plan\" or \"presence\"." }, 400);
}
