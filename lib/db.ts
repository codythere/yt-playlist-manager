// lib/db.ts
import DatabaseConstructor from "better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { logger } from "./logger";

export const DB_PATH =
  process.env.SQLITE_DB_PATH ?? join(process.cwd(), "db", "data.sqlite3");

function ensureDirectory(pathStr: string) {
  const dir = dirname(pathStr);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function applySchema(db: BetterSqlite3Database) {
  const schemaPath = join(process.cwd(), "db", "schema.sql");
  if (!existsSync(schemaPath)) {
    logger.warn(
      { schemaPath },
      "SQLite schema file missing; skipping migration"
    );
    return;
  }
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
}

function createConnection() {
  ensureDirectory(DB_PATH);
  const connection = new DatabaseConstructor(DB_PATH);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  applySchema(connection);
  return connection;
}

export const db = createConnection();

export type Db = BetterSqlite3Database;

// 🧭 偵錯：印出實際 DB 路徑
if (process.env.NODE_ENV !== "production") {
  console.log("[db] Using SQLite at:", path.resolve(DB_PATH));
}
