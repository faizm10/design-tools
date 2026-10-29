// Applies db/migrations/*.sql in filename order, once each. Usage: npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `neon env pull` or add it to .env.local.");
  process.exit(1);
}
const sql = neon(url);
const dir = new URL("../db/migrations/", import.meta.url);

await sql.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const applied = new Set((await sql.query("SELECT name FROM schema_migrations")).map((r) => r.name));

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) continue;
  const text = await readFile(new URL(file, dir), "utf8");
  // The HTTP driver runs one statement per call; split on statement-ending semicolons.
  const statements = text
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  await sql.transaction([...statements.map((s) => sql.query(s)), sql.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file])]);
  console.log(`applied ${file}`);
}
console.log("migrations up to date");
