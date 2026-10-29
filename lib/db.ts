import "server-only";
import { neon } from "@neondatabase/serverless";

// HTTP driver over the pooled connection string; one query per request suits these routes.
export const sql = neon(process.env.DATABASE_URL!);
