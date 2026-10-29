import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | undefined;

/** HTTP driver over the pooled connection string, created on first query so builds don't need it. */
export const sql: NeonQueryFunction<false, false> = ((...args: Parameters<NeonQueryFunction<false, false>>) => {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set. See .env.example.");
    client = neon(url);
  }
  return client(...args);
}) as NeonQueryFunction<false, false>;
