/**
 * Mỗi file test dùng một CSDL SQLite tạm riêng, áp dụng migration bằng SQL thô.
 */
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const dir = mkdtempSync(join(tmpdir(), "tcai-test-"));
const file = join(dir, "test.db");
const sqlite = new Database(file);
const migrationsDir = join(process.cwd(), "prisma", "migrations");
for (const m of readdirSync(migrationsDir).filter((d) => !d.endsWith(".toml")).sort()) {
  sqlite.exec(readFileSync(join(migrationsDir, m, "migration.sql"), "utf8"));
}
sqlite.close();

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL = `file:${file}`;
process.env.SESSION_SECRET = "test-secret-test-secret";
process.env.AI_PROVIDER = "fake";
process.env.PUBLIC_URL = "http://localhost:3000";
