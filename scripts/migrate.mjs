import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(sql);
  await client.query("ALTER TABLE lessons ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'full_curriculum'");
  await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT ''");
  await client.query("ALTER TABLE access_codes ALTER COLUMN student_email DROP NOT NULL");
  const cleanupKey = "demo_catalog_removed_20260907";
  const existing = await client.query("SELECT value FROM app_settings WHERE key=$1", [cleanupKey]);
  if (!existing.rowCount) {
    const demoSlugs = ["course-1", "course-2", "course-3", "course-4", "course-5", "course-6", "course-7", "course-8", "course-9"];
    const demoInstructorEmails = ["alex@atlas.demo", "maya@atlas.demo", "nora@atlas.demo", "omar@atlas.demo", "lina@atlas.demo", "karim@atlas.demo", "sara@atlas.demo", "youssef@atlas.demo", "hana@atlas.demo"];
    await client.query("BEGIN");
    const demoCourses = await client.query("SELECT id FROM courses WHERE slug=ANY($1::text[])", [demoSlugs]);
    try {
      await client.query("DELETE FROM courses WHERE slug=ANY($1::text[])", [demoSlugs]);
      await client.query("DELETE FROM users WHERE email=ANY($1::text[])", [demoInstructorEmails]);
      await client.query("DELETE FROM users WHERE email='student@example.com' AND name='Demo Student'");
      await client.query("INSERT INTO app_settings (key,value) VALUES ($1,'yes')", [cleanupKey]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"));
    for (const row of demoCourses.rows) {
      try { await rm(path.join(uploadRoot, String(row.id)), { recursive: true, force: true }); }
      catch (error) { console.warn(`Could not remove retired upload folder ${row.id}:`, error); }
    }
    console.log(`Removed ${demoCourses.rowCount || 0} retired demo courses and their related records.`);
  }
  console.log("Database schema is ready.");
} finally {
  await client.end();
}
