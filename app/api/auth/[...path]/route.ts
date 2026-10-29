import { getAuth } from "@/lib/auth/server";

type Handlers = ReturnType<ReturnType<typeof getAuth>["handler"]>;
type Ctx = Parameters<Handlers["GET"]>[1];

// Resolve the handler per request so the build doesn't need the auth secrets.
const forward = (method: keyof Handlers) => (req: Request, ctx: Ctx) => getAuth().handler()[method](req, ctx);

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const DELETE = forward("DELETE");
export const PATCH = forward("PATCH");
