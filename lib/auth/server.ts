import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

/**
 * Created on first use rather than at import, so `next build` can load the
 * route modules without the auth secrets being present.
 */
export function getAuth(): NeonAuth {
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !secret) {
      throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set. See .env.example.");
    }
    instance = createNeonAuth({ baseUrl, cookies: { secret } });
  }
  return instance;
}

/** The signed-in user's id, or null. API routes use this before touching any plan. */
export async function currentUserId(): Promise<string | null> {
  const { data: session } = await getAuth().getSession();
  return session?.user?.id ?? null;
}
